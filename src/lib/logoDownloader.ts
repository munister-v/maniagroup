/**
 * Downloads brand logos from external sources and caches them locally in
 * public/uploads/brands/. Stored logos survive deploys (rsync excludes that dir).
 *
 * Source priority (set LOGO_DEV_TOKEN env var to enable the best one):
 *   1. Logo.dev API  — excellent quality, free tier, requires LOGO_DEV_TOKEN
 *   2. Brand website apple-touch-icon — hit or miss (most return 404)
 *
 * Once a logo is on disk the file is served statically; no CDN dependency.
 */

import path from "path";
import fs from "fs";

const BRANDS_DIR = path.join(process.cwd(), "public", "uploads", "brands");

export function brandToSlug(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function localLogoUrl(brand: string): string {
  return `/uploads/brands/${brandToSlug(brand)}.png`;
}

export function hasLocalLogo(brand: string): boolean {
  return fs.existsSync(path.join(BRANDS_DIR, `${brandToSlug(brand)}.png`));
}

async function tryFetch(url: string, minBytes = 300): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; logo-fetcher/1.0)" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/") && !ct.includes("octet")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < minBytes) return null; // reject 1px blanks / empty responses
    return buf;
  } catch {
    return null;
  }
}

/**
 * Downloads a logo for a brand+domain and saves it to the local cache.
 * Returns the public URL `/uploads/brands/{slug}.png` on success, null on failure.
 * If already cached, returns the local URL immediately.
 */
export async function downloadLogoForBrand(brand: string, domain: string): Promise<string | null> {
  fs.mkdirSync(BRANDS_DIR, { recursive: true });
  const slug = brandToSlug(brand);
  const filePath = path.join(BRANDS_DIR, `${slug}.png`);

  if (fs.existsSync(filePath)) return localLogoUrl(brand);

  const sources: { url: string; minBytes?: number }[] = [];

  const token = process.env.LOGO_DEV_TOKEN;
  if (token) sources.push({ url: `https://img.logo.dev/${domain}?token=${token}&size=200` });

  sources.push({ url: `https://${domain}/apple-touch-icon.png` });
  sources.push({ url: `https://www.${domain}/apple-touch-icon.png` });
  sources.push({ url: `https://${domain}/apple-touch-icon-precomposed.png` });
  sources.push({ url: `https://${domain}/favicon.ico` });
  sources.push({ url: `https://www.${domain}/favicon.ico` });
  // No-token fallback: Google's public favicon proxy. Reliable for almost any
  // domain, but genuinely tiny (~250-300B for a 16px icon) — the default
  // anti-blank floor would reject legitimate results, so it gets a lower one.
  sources.push({ url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, minBytes: 100 });

  for (const { url: src, minBytes } of sources) {
    const buf = await tryFetch(src, minBytes);
    if (buf) {
      fs.writeFileSync(filePath, buf);
      return localLogoUrl(brand);
    }
  }

  return null;
}

/** Delete cached logo file so the next download attempt re-fetches it. */
export function clearLocalLogo(brand: string): void {
  const filePath = path.join(BRANDS_DIR, `${brandToSlug(brand)}.png`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
