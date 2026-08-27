/**
 * Grid thumbnails.
 *
 * The library grid asks for 48 images at a time and every one of them was the
 * full 2000px webp a customer gets — around 90 KB each, so roughly 4 MB to draw
 * one screen of ~170px tiles. The photos are already optimized for the
 * storefront; they are simply the wrong size for a contact sheet.
 *
 * The thumb mirrors the original's path under a /thumb/<size>/ prefix, so
 * nothing has to be looked up: /catalog/59441/4.webp becomes
 * /thumb/320/catalog/59441/4.webp. That matters twice — nginx can serve it as a
 * plain file alias without waking Node, and the grid can point at the thumb
 * URL before it exists and fall back to the original on error, which means a
 * half-finished backfill degrades to "slower", never to "broken".
 */
import { mkdir, unlink, writeFile } from "fs/promises";
import { stat } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { MEDIA_ROOT } from "./mediaStorage";
import { fullPath } from "./mediaIndex";

/** Widest tile in the grid is ~170px; 320 covers a 2× screen. */
export const THUMB_SIZE = 320;
const THUMB_QUALITY = 70;

export function thumbUrl(url: string, size = THUMB_SIZE): string {
  return `/thumb/${size}/${url.replace(/^\/+/, "")}`;
}

export function thumbFile(url: string, size = THUMB_SIZE): string | null {
  if (!/^\/(catalog|uploads)\//.test(url) || url.includes("..")) return null;
  const rel = `thumb/${size}/${url.replace(/^\/+/, "")}`;
  const full = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, rel));
  const root = path.normalize(MEDIA_ROOT);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * Build the thumb unless it is already there and newer than the original.
 * Returns false when there was nothing to do, so a backfill can count work.
 */
export async function ensureThumb(url: string, size = THUMB_SIZE): Promise<boolean> {
  const src = fullPath(url);
  const dest = thumbFile(url, size);
  if (!src || !dest) return false;

  const [srcStat, destStat] = await Promise.all([
    stat(src).catch(() => null),
    stat(dest).catch(() => null),
  ]);
  if (!srcStat) return false;
  if (destStat && destStat.mtimeMs >= srcStat.mtimeMs) return false;

  // An animated GIF flattened to a single frame is still a fine contact-sheet
  // tile — the grid is not where anyone watches the animation.
  const buf = await sharp(src, { animated: false })
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return true;
}

/** Thumbs of a deleted file are garbage that nothing will ever ask for again. */
export async function dropThumbs(url: string): Promise<void> {
  const dest = thumbFile(url);
  if (dest) await unlink(dest).catch(() => {});
}
