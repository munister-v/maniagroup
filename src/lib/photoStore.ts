/**
 * Photo storage core — pull product images off WordPress (maniagroup.com.ua)
 * into the server's own `public/catalog/<productId>/` storage and rewrite the DB
 * so the catalog is fully self-contained (no WP dependency, survives WP going
 * away). We download the full `src` only and point both src+thumbnail at it —
 * next/image resizes on the fly, so one file per image is enough.
 *
 * Resumable: a `photos_migrated` flag per product guarantees termination and
 * lets the UI loop batches until done. Server-only.
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { q, q1 } from "./pg";

const PUB_DIR = path.join(process.cwd(), "public", "catalog");

const CT_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/avif": "avif", "image/gif": "gif",
};

type ImgObj = { id?: number; src: string; thumbnail?: string; alt?: string };

const isExternal = (url: string) => /^https?:\/\//i.test(url);

async function download(url: string, destDir: string, base: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
    let ext = CT_EXT[ct];
    if (!ext) ext = url.split("?")[0].match(/\.(jpe?g|png|webp|avif|gif)$/i)?.[1]?.toLowerCase() ?? "";
    if (!ext) return null;
    if (ext === "jpeg") ext = "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null; // guard against error pages
    await mkdir(destDir, { recursive: true });
    const file = `${base}.${ext}`;
    await writeFile(path.join(destDir, file), buf);
    return file;
  } catch {
    return null;
  }
}

export type PhotoStatus = { migrated: number; pending: number; withPhotos: number; external: number };

export async function photoStatus(): Promise<PhotoStatus> {
  const r = await q1<{ migrated: string; pending: string; with_photos: string; external: string }>(
    `SELECT
       count(*) FILTER (WHERE photos_migrated)::text AS migrated,
       count(*) FILTER (WHERE NOT photos_migrated AND (image_src LIKE 'http%' OR images::text LIKE '%maniagroup.com.ua%'))::text AS pending,
       count(*) FILTER (WHERE images IS NOT NULL AND images::text NOT IN ('[]','null',''))::text AS with_photos,
       count(*) FILTER (WHERE image_src LIKE 'http%')::text AS external
     FROM products WHERE status = 'publish'`,
  );
  return {
    migrated: Number(r?.migrated ?? 0),
    pending: Number(r?.pending ?? 0),
    withPhotos: Number(r?.with_photos ?? 0),
    external: Number(r?.external ?? 0),
  };
}

export type BatchResult = { processed: number; downloaded: number; failed: number; remaining: number };

/**
 * Migrate one batch of products. Downloads each external image into
 * public/catalog/<id>/, rewrites the products row to local paths, and marks it
 * migrated (even on partial failure — failed images keep their WP url and can be
 * retried via resetFailed). Returns counts + how many products still pending.
 */
export async function migratePhotoBatch(
  limit = 80,
  onProgress?: (msg: string) => void,
): Promise<BatchResult> {
  const rows = await q<{ id: string; images: string; image_src: string }>(
    `SELECT id::text, images::text AS images, image_src
       FROM products
      WHERE status = 'publish' AND NOT photos_migrated
        AND (image_src LIKE 'http%' OR images::text LIKE '%maniagroup.com.ua%')
      ORDER BY id LIMIT $1`,
    [limit],
  );

  let downloaded = 0, failed = 0, processed = 0;

  for (const row of rows) {
    let imgs: ImgObj[] = [];
    try { imgs = JSON.parse(row.images || "[]"); } catch {}
    const destDir = path.join(PUB_DIR, row.id);
    const out: ImgObj[] = [];
    let okCount = 0;

    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (!img?.src) continue;
      if (!isExternal(img.src)) { out.push(img); okCount++; continue; } // already local
      const file = await download(img.src, destDir, String(i + 1));
      if (file) {
        const local = `/catalog/${row.id}/${file}`;
        out.push({ ...img, src: local, thumbnail: local });
        downloaded++; okCount++;
      } else {
        out.push(img);    // keep WP url for a later retry
        failed++;
      }
    }

    const firstLocal = out.find((o) => !isExternal(o.src))?.src ?? out[0]?.src ?? "";
    await q(
      `UPDATE products SET images = $2::jsonb, image_src = $3, photos_migrated = TRUE, updated_at = now() WHERE id = $1`,
      [Number(row.id), JSON.stringify(out), firstLocal],
    );
    processed++;
    onProgress?.(`#${row.id}: ${okCount}/${imgs.length} фото локально`);
  }

  const st = await photoStatus();
  return { processed, downloaded, failed, remaining: st.pending };
}

/** Re-queue products whose main image is still external (failed downloads). */
export async function resetFailedPhotos(): Promise<number> {
  const r = await q<{ id: string }>(
    `UPDATE products SET photos_migrated = FALSE
      WHERE photos_migrated AND image_src LIKE 'http%' RETURNING id::text`,
  );
  return r.length;
}
