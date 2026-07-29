import path from "path";

const DEFAULT_MEDIA_ROOT =
  process.env.NODE_ENV === "production"
    ? "/var/lib/maniagroup/media"
    : path.join(process.cwd(), "public");

export const MEDIA_ROOT = process.env.MANIA_MEDIA_ROOT?.trim() || DEFAULT_MEDIA_ROOT;
export const CATALOG_DIR = path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, "catalog");
export const UPLOADS_DIR = path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, "uploads");

export function mediaUrlToPath(url: string): string | null {
  if (!/^\/(catalog|uploads)\//.test(url) || url.includes("..")) return null;
  const rel = url.replace(/^\/+/, "");
  const full = path.normalize(path.join(/*turbopackIgnore: true*/ MEDIA_ROOT, rel));
  const root = path.normalize(MEDIA_ROOT);
  return full.startsWith(root + path.sep) ? full : null;
}
