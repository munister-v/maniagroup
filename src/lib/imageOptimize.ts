/**
 * Shared image-processing pipeline for anything an admin uploads (product
 * photos, media library, bulk photo matcher). Auto-orients (EXIF), caps the
 * longest side so nobody accidentally serves a 6000px camera photo to
 * customers, and re-encodes to WebP for a consistent, small file size.
 *
 * Animated GIFs are passed through untouched — flattening one with sharp's
 * default single-frame output would silently kill the animation.
 */
import sharp from "sharp";

const MAX_DIMENSION = 2000; // px, longest side
const WEBP_QUALITY = 82;

export type OptimizedImage = { buffer: Buffer; ext: string; contentType: string };

export async function optimizeImage(buf: Buffer, mimeType: string): Promise<OptimizedImage> {
  if (mimeType === "image/gif") {
    return { buffer: buf, ext: "gif", contentType: "image/gif" };
  }
  const out = await sharp(buf, { animated: false })
    .rotate() // apply EXIF orientation, then strip it
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return { buffer: out, ext: "webp", contentType: "image/webp" };
}
