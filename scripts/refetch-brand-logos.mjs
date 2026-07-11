/**
 * One-off ops script: re-fetch every auto brand logo at high resolution and
 * reclassify its background. Self-contained (pg + sharp only) so it can run
 * directly on the VPS against the real DB + public/uploads/brands, without
 * needing an admin session. Mirrors lib/logoDownloader.ts + brandLogos.ts:
 *   - Logo.dev at 512px retina (→ ~1024px) when LOGO_DEV_TOKEN is set
 *   - sharp dimension gate: reject < 64px (kills favicon-tier garbage)
 *   - bg classify from corner pixels (dark-filled → 'dark' tile)
 *   - never touches manual logos or bundled brands
 *   - a brand Logo.dev no longer serves at ≥64px → file + auto row purged
 *     (falls back to a clean text wordmark)
 *
 * Usage (on VPS):
 *   set -a; . /opt/maniagroup/.env.local; set +a
 *   node scripts/refetch-brand-logos.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import pg from "pg";

const BRANDS_DIR = path.join(process.cwd(), "public", "uploads", "brands");
const MIN_DIM = 64;
const TOKEN = process.env.LOGO_DEV_TOKEN || "";

// Bundled hand-made PNGs (catalog.ts BRAND_LOGO_BY_DBNAME) — skip, never auto.
const BUNDLED = new Set(["EA7", "EA7 Swim", "MOSCHINO Love", "ANTONY MORATO", "HARMONT&BLAINE", "MC2 SAINT BARTH", "FRED MELLO"]);

const BRAND_DOMAINS = JSON.parse(fs.readFileSync(new URL("./brand-domains.json", import.meta.url), "utf8"));

function slugify(brand) {
  return brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function rawFetch(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; logo-fetcher/1.0)" } });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/") && !ct.includes("octet")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length >= 64 ? buf : null;
  } catch { return null; }
}

async function classifyBg(png) {
  try {
    const { data, info } = await sharp(png).resize(8, 8, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
    let darkOpaque = 0;
    for (const [x, y] of corners) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const a = channels >= 4 ? data[i + 3] : 255;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (a > 200 && lum < 0.4) darkOpaque++;
    }
    return darkOpaque >= 3 ? "dark" : "light";
  } catch { return "light"; }
}

async function isMonochrome(png) {
  try {
    const { data, info } = await sharp(png).resize(24, 24, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let sat = 0, n = 0;
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = ch >= 4 ? data[i + 3] : 255;
      if (a < 128) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx; n++;
    }
    return n === 0 ? true : sat / n < 0.15;
  } catch { return false; }
}

async function processLogo(buf) {
  try {
    const base = sharp(buf, { failOn: "none" });
    const meta = await base.metadata();
    if ((meta.width ?? 0) < MIN_DIM || (meta.height ?? 0) < MIN_DIM) return null;
    let png = await base.png().toBuffer();
    let bg = await classifyBg(png);
    if (bg === "dark" && (await isMonochrome(png))) {
      png = await sharp(png).negate({ alpha: false }).png().toBuffer();
      bg = "light";
    }
    return { png, bg };
  } catch { return null; }
}

async function fetchLogo(brand, domain) {
  const sources = [];
  if (TOKEN) sources.push(`https://img.logo.dev/${domain}?token=${TOKEN}&size=512&format=png&retina=true&fallback=404`);
  sources.push(`https://${domain}/apple-touch-icon.png`, `https://www.${domain}/apple-touch-icon.png`, `https://${domain}/apple-touch-icon-precomposed.png`);
  if (!TOKEN) sources.push(`https://${domain}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  for (const src of sources) {
    const raw = await rawFetch(src);
    if (!raw) continue;
    const p = await processLogo(raw);
    if (p) return p;
  }
  return null;
}

async function main() {
  fs.mkdirSync(BRANDS_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  // Defensive: the app adds this on boot, but run standalone the column may
  // not exist yet.
  await pool.query("ALTER TABLE brand_logos ADD COLUMN IF NOT EXISTS bg TEXT NOT NULL DEFAULT 'light'");
  const { rows: existing } = await pool.query("SELECT brand, source FROM brand_logos");
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.brand));

  let saved = 0, purged = 0, darkCount = 0;
  for (const [brand, domain] of Object.entries(BRAND_DOMAINS)) {
    if (manual.has(brand) || BUNDLED.has(brand)) continue;
    const logo = await fetchLogo(brand, domain);
    const file = path.join(BRANDS_DIR, `${slugify(brand)}.png`);
    if (logo) {
      fs.writeFileSync(file, logo.png);
      await pool.query(
        `INSERT INTO brand_logos (brand, logo_url, source, bg, updated_at) VALUES ($1,$2,'auto',$3,now())
         ON CONFLICT (brand) DO UPDATE SET logo_url=EXCLUDED.logo_url, source='auto', bg=EXCLUDED.bg, updated_at=now()`,
        [brand, `/uploads/brands/${slugify(brand)}.png`, logo.bg],
      );
      saved++;
      if (logo.bg === "dark") darkCount++;
      console.log(`  ✓ ${brand} (${logo.bg})`);
    } else {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      await pool.query("DELETE FROM brand_logos WHERE brand = $1 AND source = 'auto'", [brand]);
      purged++;
      console.log(`  ✗ ${brand} → purged (no ≥${MIN_DIM}px logo)`);
    }
  }
  console.log(`\nDone: ${saved} saved (${darkCount} dark-tile), ${purged} purged to text.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
