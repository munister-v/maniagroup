/**
 * Pulls product photos from an external WordPress site's public media
 * library (the standard `wp/v2/media` REST endpoint — no auth needed, it's
 * public by default on any WP install). Built for the old WooCommerce site
 * these products originally migrated from: its media filenames follow the
 * same "<code>-<n>.<ext>" convention as manual bulk photo uploads here
 * (lib's own BulkPhotoMatcher), so the same code/order extraction applies.
 *
 * This is intentionally generic over the base URL (see settings.ts
 * wp_photo_source_url) rather than hardcoded to one domain — any other
 * WordPress site can be pointed at later without code changes.
 */

export type WpPhotoCandidate = { url: string; order: number };

/**
 * Search a WP site's media library for images whose filename starts with
 * `code` (case-insensitive). WP's own `search` param is fuzzy full-text, so
 * results are filtered again here to require an actual prefix match —
 * otherwise a short numeric code like "205" would match "12055-2.jpg" too.
 */
export async function searchWpPhotos(baseUrl: string, code: string): Promise<WpPhotoCandidate[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const base = baseUrl.trim().replace(/\/+$/, "");
  const url = `${base}/wp-json/wp/v2/media?search=${encodeURIComponent(trimmed)}&per_page=20&media_type=image`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data: unknown;
  try { data = await res.json(); } catch { return []; }
  if (!Array.isArray(data)) return [];

  const codeLower = trimmed.toLowerCase();
  const out: WpPhotoCandidate[] = [];
  for (const item of data as Record<string, unknown>[]) {
    const slug = String(item.slug ?? "").toLowerCase();
    if (!slug.startsWith(codeLower)) continue;
    const guid = item.guid as { rendered?: string } | undefined;
    const photoUrl = guid?.rendered || (item.source_url as string | undefined);
    if (!photoUrl) continue;
    const rest = slug.slice(codeLower.length);
    const m = rest.match(/(\d+)/);
    out.push({ url: photoUrl, order: m ? Number(m[1]) : 0 });
  }
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** Tries each source in order, returning the first one with any match. */
export async function searchAcrossSources(
  sources: { id: number; base_url: string }[],
  code: string,
): Promise<{ sourceId: number; photos: WpPhotoCandidate[] } | null> {
  for (const s of sources) {
    const photos = await searchWpPhotos(s.base_url, code);
    if (photos.length > 0) return { sourceId: s.id, photos };
  }
  return null;
}

/**
 * Confirms a base URL is actually a reachable WordPress site with the
 * public media REST endpoint enabled — used when adding a source in
 * Налаштування so a typo or dead site is caught before it silently
 * returns zero matches on every future search.
 */
export async function pingWpSource(baseUrl: string): Promise<boolean> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/media?per_page=1`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Array.isArray(data);
  } catch {
    return false;
  }
}

/** Download the actual image bytes (server-side, no CORS concern). */
export async function fetchImageBytes(url: string): Promise<{ buf: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, mimeType };
  } catch {
    return null;
  }
}
