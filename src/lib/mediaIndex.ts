/**
 * The media library's index: one row per file that exists under MEDIA_ROOT.
 *
 * Why a table at all, when the files are right there on disk? Because the disk
 * answers exactly one question — "does this file exist" — and the library needs
 * several more. The uploader names files by UUID, so the original filename is
 * gone the moment a photo lands; alt text, dimensions and a content hash have
 * nowhere to live; and every listing used to walk ~13.5k directory entries to
 * render 48 thumbnails.
 *
 * The table mirrors the disk, it does not own it. `path` is the public URL
 * (/uploads/x.webp, /catalog/<productId>/2.webp) byte-for-byte as products.images
 * stores it, so nothing here renames, moves or rewrites a file. Disk stays the
 * source of truth for bytes; the row is what we know *about* those bytes. When
 * the two disagree, syncMediaIndex() believes the disk.
 */
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { q } from "./pg";
import { CATALOG_DIR, MEDIA_ROOT, UPLOADS_DIR } from "./mediaStorage";

export const IMAGE_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

export type MediaSource = "uploads" | "catalog";

export type DiskFile = {
  url: string;        // public path, e.g. /catalog/12345/2.webp
  source: MediaSource;
  folder: string;     // directory below the source root; '' for a file at the root
  name: string;       // basename
  bytes: number;
  mtimeMs: number;
};

/**
 * Every image under one source root, at any depth.
 *
 * Depth matters: /uploads is flat today but the library is about to grow real
 * folders, and /catalog is already one directory per product. A single-level
 * readdir would quietly stop seeing files the moment either changes.
 */
async function walk(root: string, source: MediaSource, rel = ""): Promise<DiskFile[]> {
  const dir = rel ? path.join(root, rel) : root;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: DiskFile[] = [];

  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await walk(root, source, childRel)));
      continue;
    }
    if (!e.isFile() || !IMAGE_RE.test(e.name)) continue;
    const s = await stat(path.join(dir, e.name)).catch(() => null);
    if (!s) continue;
    out.push({
      url: `/${source}/${childRel}`,
      source,
      folder: rel,
      name: e.name,
      bytes: s.size,
      mtimeMs: s.mtimeMs,
    });
  }
  return out;
}

export async function scanDisk(): Promise<DiskFile[]> {
  const [uploads, catalog] = await Promise.all([
    walk(UPLOADS_DIR, "uploads"),
    walk(CATALOG_DIR, "catalog"),
  ]);
  return [...uploads, ...catalog];
}

/** Public URL → absolute path, refusing anything that escapes MEDIA_ROOT. */
export function fullPath(url: string): string | null {
  if (!/^\/(catalog|uploads)\//.test(url) || url.includes("..")) return null;
  const full = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, url.replace(/^\/+/, "")));
  const root = path.normalize(MEDIA_ROOT);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * Pixel dimensions. Never throws: a truncated or non-image file should leave a
 * row with 0×0, not abort a sync over 13.5k files.
 */
export async function probeDimensions(file: string): Promise<{ width: number; height: number }> {
  try {
    const m = await sharp(file, { animated: false }).metadata();
    return { width: m.width ?? 0, height: m.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Streamed so a 12 MB photo never sits in memory next to the shop it serves. */
export async function hashFile(file: string): Promise<string> {
  return new Promise((resolve) => {
    const h = createHash("sha256");
    const rs = createReadStream(file);
    rs.on("data", (c) => h.update(c));
    rs.on("end", () => resolve(h.digest("hex")));
    rs.on("error", () => resolve(""));
  });
}

export type SyncStats = { added: number; updated: number; removed: number; total: number };

/**
 * Reconcile table against disk.
 *
 * Runs in bounded slices (`limit`) because the first pass over a 13.5k-file,
 * 1.4 GB library reads every byte to hash it, inside the same process that
 * serves the shop on a 1.7 GB box. The caller loops until `added + updated`
 * comes back 0. Rows whose file vanished are dropped in one statement.
 *
 * `withHash: false` skips the read entirely (metadata-only, near-instant) for
 * callers that just want the listing to work.
 */
export async function syncMediaIndex(opts: { limit?: number; withHash?: boolean } = {}): Promise<SyncStats> {
  const limit = opts.limit ?? 500;
  const withHash = opts.withHash ?? true;

  const disk = await scanDisk();
  const byUrl = new Map(disk.map((f) => [f.url, f]));

  const rows = await q<{ path: string; bytes: string; mtime: string | null; sha256: string; width: number }>(
    "SELECT path, bytes::text, mtime, sha256, width FROM media",
  );
  const known = new Map(rows.map((r) => [r.path, r]));

  // Gone from disk: the row is the stale one, drop it.
  const orphans = rows.filter((r) => !byUrl.has(r.path)).map((r) => r.path);
  let removed = 0;
  if (orphans.length) {
    for (let i = 0; i < orphans.length; i += 1000) {
      const chunk = orphans.slice(i, i + 1000);
      await q("DELETE FROM media WHERE path = ANY($1::text[])", [chunk]);
      removed += chunk.length;
    }
  }

  // New, changed, or indexed before we started hashing/measuring.
  const pending = disk.filter((f) => {
    const row = known.get(f.url);
    if (!row) return true;
    if (Number(row.bytes) !== f.bytes) return true;
    if (row.mtime && Math.abs(new Date(row.mtime).getTime() - f.mtimeMs) > 1500) return true;
    if (withHash && !row.sha256) return true;
    if (!row.width) return true;
    return false;
  });

  let added = 0;
  let updated = 0;

  for (const f of pending.slice(0, limit)) {
    const abs = fullPath(f.url);
    if (!abs) continue;
    const { width, height } = await probeDimensions(abs);
    const sha = withHash ? await hashFile(abs) : "";
    const ext = path.extname(f.name).replace(/^\./, "").toLowerCase();

    // original_name is only ever filled in by an upload that knew it. A backfill
    // has no way to recover it, so it must not overwrite one that already exists.
    const res = await q<{ inserted: boolean }>(
      `INSERT INTO media (path, source, folder, original_name, ext, bytes, width, height, sha256, mtime)
            VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, to_timestamp($9))
       ON CONFLICT (path) DO UPDATE
            SET source = EXCLUDED.source,
                folder = EXCLUDED.folder,
                ext    = EXCLUDED.ext,
                bytes  = EXCLUDED.bytes,
                width  = EXCLUDED.width,
                height = EXCLUDED.height,
                sha256 = CASE WHEN EXCLUDED.sha256 <> '' THEN EXCLUDED.sha256 ELSE media.sha256 END,
                mtime  = EXCLUDED.mtime
        RETURNING (xmax = 0) AS inserted`,
      [f.url, f.source, f.folder, ext, f.bytes, width, height, sha, f.mtimeMs / 1000],
    );
    if (res[0]?.inserted) added++;
    else updated++;
  }

  return { added, updated, removed, total: disk.length };
}

/** Called by the uploader once the optimized bytes are on disk. */
export async function recordUpload(input: {
  url: string;
  source: MediaSource;
  folder: string;
  originalName: string;
  ext: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  createdBy?: string;
}): Promise<void> {
  await q(
    `INSERT INTO media (path, source, folder, original_name, ext, bytes, width, height, sha256, mtime, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), $10)
     ON CONFLICT (path) DO UPDATE
          SET original_name = EXCLUDED.original_name,
              bytes = EXCLUDED.bytes, width = EXCLUDED.width, height = EXCLUDED.height,
              sha256 = EXCLUDED.sha256, mtime = EXCLUDED.mtime`,
    [
      input.url, input.source, input.folder, input.originalName, input.ext,
      input.bytes, input.width, input.height, input.sha256, input.createdBy ?? "",
    ],
  );
}

/** Existing file with identical bytes, so a re-upload reuses it instead of doubling it. */
export async function findByHash(sha256: string): Promise<{ path: string; original_name: string } | null> {
  if (!sha256) return null;
  const rows = await q<{ path: string; original_name: string }>(
    "SELECT path, original_name FROM media WHERE sha256 = $1 LIMIT 1",
    [sha256],
  );
  return rows[0] ?? null;
}

export async function forgetMedia(url: string): Promise<void> {
  await q("DELETE FROM media WHERE path = $1", [url]);
}
