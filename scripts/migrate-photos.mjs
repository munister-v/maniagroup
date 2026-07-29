/**
 * Pull product photos off the live WordPress shop into our own storage,
 * re-encoded to WebP, and repoint the catalog at the local copies.
 *
 * Why not lib/photoStore.ts (which already migrates photos): it saves the
 * original bytes untouched. The WP originals are ~500-650 KB JPEGs at
 * 1035x1440, and there are 13k of them for the published catalog alone — about
 * 6.6 GB against 8.7 GB free on this box. WebP q82 at the same resolution
 * lands ~110 KB, so the whole set fits in roughly 1.5 GB with no visible
 * quality loss. (AVIF q55 is smaller still, ~77 KB, but takes 4.1 s per image
 * versus 0.2 s — half a day of CPU on a 2-core VPS, which is not worth it.)
 *
 * Safe to interrupt and re-run: progress is the `photos_migrated` flag, and an
 * already-written file is never re-downloaded. Images that fail keep their
 * WordPress URL so the storefront still shows something, and lib/photoStore's
 * resetFailedPhotos() can re-queue them.
 *
 * Run it with a heap cap so it can never crowd out the site:
 *   node --max-old-space-size=384 scripts/migrate-photos.mjs [--scope=publish|all] [--limit=N] [--dry]
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pg from "pg";

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : dflt;
};
const SCOPE = arg("scope", "publish");
const LIMIT = Number(arg("limit", "0")) || null;
const DRY = args.includes("--dry");

const PUB_DIR = path.join(process.cwd(), "public", "catalog");
const QUALITY = 82;
// The live WP shop serves real customers — keep the crawl gentle. Two at a
// time also keeps peak memory down, which matters more here than speed.
const CONCURRENCY = 2;
const TIMEOUT_MS = 25000;

// This box has 1.7 GB and runs the shop itself. An earlier run at concurrency
// 4 with sharp's defaults grew to 1.2 GB RSS and was OOM-killed by the kernel
// 1525 products in. libvips keeps an operation cache and its own thread pool
// per decode, and neither is bounded by anything Node can see — so switch both
// off rather than trying to out-GC them. Run with --max-old-space-size=384.
sharp.cache(false);
sharp.concurrency(1);

const isExternal = (u) => /^https?:\/\//i.test(String(u || ""));
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const where =
  SCOPE === "all"
    ? "NOT photos_migrated AND images::text LIKE '%http%'"
    : "status = 'publish' AND NOT photos_migrated AND images::text LIKE '%http%'";

const { rows: todo } = await pool.query(
  `SELECT id::text AS id, images::text AS images FROM products
    WHERE ${where} ORDER BY id ${LIMIT ? `LIMIT ${LIMIT}` : ""}`,
);

let totalImgs = 0;
for (const r of todo) {
  try { totalImgs += JSON.parse(r.images || "[]").filter((i) => isExternal(i?.src)).length; } catch {}
}

console.log(`scope:       ${SCOPE}`);
console.log(`products:    ${todo.length}`);
console.log(`images:      ${totalImgs}`);
console.log(`target:      ${PUB_DIR}/<id>/<n>.webp  (webp q${QUALITY}, original resolution)`);
if (DRY) {
  console.log("\nDry run — nothing downloaded.");
  await pool.end();
  process.exit(0);
}

let done = 0, saved = 0, failed = 0, skipped = 0, bytesIn = 0, bytesOut = 0;
const startedAt = Date.now();

/** Download one image and re-encode it to WebP. Returns the public path or null. */
async function fetchOne(url, destDir, base) {
  const dest = path.join(destDir, `${base}.webp`);
  // Resume: a file already on disk is done, don't hit WP again for it.
  try {
    const st = await stat(dest);
    if (st.size > 1024) { skipped++; bytesOut += st.size; return `${base}.webp`; }
  } catch {}

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    // A WP error page can come back as 200 with HTML in the body.
    if (input.length < 1024) return null;

    const out = await sharp(input).rotate().webp({ quality: QUALITY }).toBuffer();
    await mkdir(destDir, { recursive: true });
    await writeFile(dest, out);
    bytesIn += input.length;
    bytesOut += out.length;
    saved++;
    return `${base}.webp`;
  } catch {
    return null;
  }
}

/** Run tasks with a fixed worker pool — the box has 1.7 GB, don't fan out. */
async function pooled(items, worker, size) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

for (const row of todo) {
  let imgs = [];
  try { imgs = JSON.parse(row.images || "[]"); } catch {}
  const destDir = path.join(PUB_DIR, row.id);

  const out = await pooled(
    imgs,
    async (img, i) => {
      if (!img?.src) return null;
      if (!isExternal(img.src)) return img;              // already local
      const file = await fetchOne(img.src, destDir, String(i + 1));
      if (!file) { failed++; return img; }               // keep WP url for a retry
      const local = `/catalog/${row.id}/${file}`;
      return { ...img, src: local, thumbnail: local };
    },
    CONCURRENCY,
  );

  const images = out.filter(Boolean);
  const firstLocal = images.find((o) => !isExternal(o.src))?.src ?? images[0]?.src ?? "";

  await pool.query(
    `UPDATE products SET images = $2::jsonb, image_src = $3,
            photos_migrated = TRUE, updated_at = now()
      WHERE id = $1`,
    [Number(row.id), JSON.stringify(images), firstLocal],
  );

  if (++done % 25 === 0 || done === todo.length) {
    const secs = (Date.now() - startedAt) / 1000;
    const rate = done / secs;
    const eta = rate > 0 ? Math.round((todo.length - done) / rate) : 0;
    const rss = Math.round(process.memoryUsage().rss / 1048576);
    console.log(
      `${done}/${todo.length} products · ${saved} saved, ${skipped} already there, ${failed} failed` +
      ` · ${kb(bytesOut)} written · rss ${rss}MB` +
      ` · ETA ${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, "0")}s`,
    );
  }
}

const ratio = bytesIn > 0 ? (100 - (bytesOut / bytesIn) * 100).toFixed(0) : "0";
console.log(`\ndone in ${Math.round((Date.now() - startedAt) / 1000)}s`);
console.log(`  products:   ${done}`);
console.log(`  downloaded: ${saved}   already present: ${skipped}   failed: ${failed}`);
console.log(`  ${kb(bytesIn)} from WP → ${kb(bytesOut)} on disk  (−${ratio}%)`);
await pool.end();
