/**
 * Downloads brand logos from external sources and caches them locally in
 * public/uploads/brands/. Stored logos survive deploys (rsync excludes that dir).
 *
 * Source priority (set LOGO_DEV_TOKEN env var to enable the best one):
 *   1. Logo.dev API — clean, high-res (requested at 512px retina → ~1024px)
 *   2. Brand website apple-touch-icon — usually 180px, acceptable
 *   (favicon.ico / Google's favicon proxy are DELIBERATELY dropped when a
 *    Logo.dev token is present — they only ever return 16-32px pixelated
 *    icons that look worse than the clean text-wordmark fallback.)
 *
 * Every candidate passes a real dimension gate (sharp) — anything under 64px
 * is rejected so tiny favicons never get saved as a "logo". Each accepted
 * logo is also classified light/dark by sampling its corner pixels, so the
 * UI can put solid-dark-fill logos (e.g. white-on-black PINKO) on a dark tile
 * instead of showing a black box on the white strip.
 *
 * Once a logo is on disk the file is served statically; no CDN dependency.
 */

import path from "path";
import fs from "fs";
import sharp from "sharp";

const BRANDS_DIR = path.join(process.cwd(), "public", "uploads", "brands");
const MIN_DIM = 64;

export type LogoBg = "light" | "dark";
export type DownloadedLogo = { url: string; bg: LogoBg };

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

async function rawFetch(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; logo-fetcher/1.0)" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/") && !ct.includes("octet")) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length >= 64 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Normalize a fetched logo through sharp: enforce the minimum dimension,
 * re-encode to a clean PNG, and make it render well on the white brand tile.
 * A solid-dark-fill MONOCHROME logo (white-on-black wordmark, e.g. PINKO /
 * FENDI / MOSCHINO) is inverted to dark-on-white so it reads on the white
 * tile instead of showing as a black box; COLORED logos (e.g. a red mascot
 * badge) are left untouched. Returns null when too small or undecodable.
 */
async function processLogo(buf: Buffer): Promise<{ png: Buffer; bg: LogoBg } | null> {
  try {
    const base = sharp(buf, { failOn: "none" });
    const meta = await base.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < MIN_DIM || h < MIN_DIM) return null;

    let png = await base.png().toBuffer();
    let bg = await classifyBg(png);
    if (bg === "dark" && (await isMonochrome(png))) {
      png = await sharp(png).negate({ alpha: false }).png().toBuffer();
      bg = "light";
    }
    return { png, bg };
  } catch {
    return null;
  }
}

/**
 * Mean colour saturation of opaque pixels on a 24×24 thumbnail. Near-zero for
 * a black/white/grey wordmark (safe to colour-invert), high for a genuinely
 * coloured logo (must NOT be inverted — inversion would flip its brand colours).
 */
async function isMonochrome(png: Buffer): Promise<boolean> {
  try {
    const { data, info } = await sharp(png)
      .resize(24, 24, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let sat = 0, n = 0;
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const a = ch >= 4 ? data[i + 3] : 255;
      if (a < 128) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      n++;
    }
    return n === 0 ? true : sat / n < 0.15;
  } catch {
    return false;
  }
}

/**
 * Sample the four corners (background region for a centered logo) on an 8×8
 * thumbnail. If the corners are mostly opaque AND dark, the logo has a solid
 * dark fill and needs a dark tile; otherwise it's light/transparent.
 */
async function classifyBg(png: Buffer): Promise<LogoBg> {
  try {
    const { data, info } = await sharp(png)
      .resize(8, 8, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const corners = [
      [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    ];
    let darkOpaque = 0;
    for (const [x, y] of corners) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const a = channels >= 4 ? data[i + 3] : 255;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (a > 200 && lum < 0.4) darkOpaque++;
    }
    return darkOpaque >= 3 ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Downloads a logo for a brand+domain, normalizes it, and saves it to the
 * local cache. Returns { url, bg } on success, null on failure. If already
 * cached and `force` is false, returns the cached url (bg re-derived from the
 * file). With `force`, any existing file is re-fetched.
 */
export async function downloadLogoForBrand(
  brand: string, domain: string, force = false,
): Promise<DownloadedLogo | null> {
  fs.mkdirSync(BRANDS_DIR, { recursive: true });
  const slug = brandToSlug(brand);
  const filePath = path.join(BRANDS_DIR, `${slug}.png`);

  if (!force && fs.existsSync(filePath)) {
    const bg = await classifyBg(fs.readFileSync(filePath)).catch((): LogoBg => "light");
    return { url: localLogoUrl(brand), bg };
  }

  const token = process.env.LOGO_DEV_TOKEN;
  const sources: string[] = [];
  if (token) {
    // High-res, retina → ~1024px clean logo. fallback=404 makes Logo.dev
    // return 404 (instead of a generic single-letter monogram avatar) for
    // brands it has no real logo for, so those fall through to the brand's
    // own apple-touch-icon and ultimately a clean text wordmark — a styled
    // full brand name reads far better than a generic "L"/"M" letter tile.
    sources.push(`https://img.logo.dev/${domain}?token=${token}&size=512&format=png&retina=true&fallback=404`);
  }
  sources.push(`https://${domain}/apple-touch-icon.png`);
  sources.push(`https://www.${domain}/apple-touch-icon.png`);
  sources.push(`https://${domain}/apple-touch-icon-precomposed.png`);
  if (!token) {
    // Only when we have NO better source: last-ditch favicon proxies. These
    // are tiny and usually fail the 64px gate, but better than nothing when
    // Logo.dev isn't configured.
    sources.push(`https://${domain}/favicon.ico`);
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }

  for (const src of sources) {
    const raw = await rawFetch(src);
    if (!raw) continue;
    const processed = await processLogo(raw);
    if (!processed) continue;
    fs.writeFileSync(filePath, processed.png);
    return { url: localLogoUrl(brand), bg: processed.bg };
  }

  return null;
}

/** Delete cached logo file so the next download attempt re-fetches it. */
export function clearLocalLogo(brand: string): void {
  const filePath = path.join(BRANDS_DIR, `${brandToSlug(brand)}.png`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
