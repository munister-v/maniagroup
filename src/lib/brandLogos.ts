/**
 * Brand logo resolution.
 *
 * Priority when rendering a brand mark:
 *   1. brand_logos table (admin upload OR auto-filled CDN URL)
 *   2. bundled PNG in BRAND_LOGO_BY_DBNAME (catalog.ts) — the 6 hand-made ones
 *   3. text wordmark (handled by the <BrandLogo> client component)
 *
 * "Auto" fill uses a curated brand→domain map + a logo CDN (Clearbit). A wrong
 * or missing domain just 404s and the client falls back to text, so best-effort
 * domains are safe to include; the admin can override any of them by hand.
 */
import { q } from "./pg";
import { BRAND_LOGO_BY_DBNAME } from "./catalog";

export type BrandLogoRow = { brand: string; logo_url: string; source: "manual" | "auto" };

/** Curated domains for well-known brands in the catalog (best-effort). */
const BRAND_DOMAINS: Record<string, string> = {
  EA7: "armani.com",
  "EA7 Swim": "armani.com",
  "ARMANI JEANS": "armani.com",
  "HARMONT&BLAINE": "harmontblaine.com",
  PINKO: "pinko.com",
  "MOSCHINO Love": "moschino.com",
  "MOSCHINO u.wear": "moschino.com",
  "MOSCHINO beach.wear": "moschino.com",
  "MOSCHINO JEANS": "moschino.com",
  "FRED MELLO": "fredmello.com",
  KOCCA: "kocca.it",
  "TWIN SET": "twinset.com",
  "TWIN SET MILANO": "twinset.com",
  "TRUSSARDI JEANS": "trussardi.com",
  "TRUSSARDI ACTION": "trussardi.com",
  "MC2 SAINT BARTH": "mc2saintbarth.com",
  "ANTONY MORATO": "antonymorato.com",
  LANCASTER: "lancaster-paris.com",
  "ICE ICEBERG": "iceberg.com",
  "JOHN RICHMOND": "johnrichmond.com",
  "RICHMOND X": "johnrichmond.com",
  BOMBOOGIE: "bomboogie.com",
  BLUGIRL: "blumarine.com",
  "D&G": "dolcegabbana.com",
  "DOLCE&GABBANA": "dolcegabbana.com",
  DSQUARED: "dsquared2.com",
  "MISSONI M": "missoni.com",
  "JUST CAVALLI": "robertocavalli.com",
  INVICTA: "invicta.it",
  "MARINA YACHTING": "marinayachting.it",
  "VALENTINO RED": "valentino.com",
  "TRUE RELIGION": "truereligion.com",
  COLMAR: "colmar.it",
  "JACOB COHEN": "jacobcohen.it",
  PEUTEREY: "peuterey.com",
  "ROY ROGERS": "royrogers.it",
  "K K.LAGERFELD": "karl.com",
  "Jean's PAUL GAULTIER": "jeanpaulgaultier.com",
  GALLIANO: "maisonmargiela.com",
};

/** Build a logo CDN URL for a domain (Clearbit). */
export function cdnLogoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}?size=200`;
}

/** All stored brand logos as a {brand: url} map. */
export async function getBrandLogoMap(): Promise<Record<string, string>> {
  const rows = await q<{ brand: string; logo_url: string }>(
    "SELECT brand, logo_url FROM brand_logos",
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.brand] = r.logo_url;
  return out;
}

/** Full rows (with source) for the admin manager. */
export async function listBrandLogos(): Promise<BrandLogoRow[]> {
  return q<BrandLogoRow>("SELECT brand, logo_url, source FROM brand_logos ORDER BY brand");
}

/** Resolve the best logo URL for one brand: DB → bundled PNG → null (text). */
export function resolveBrandLogo(name: string, dbMap: Record<string, string>): string | null {
  return dbMap[name] || BRAND_LOGO_BY_DBNAME[name] || null;
}

/**
 * Bundled PNGs merged with stored logos (stored wins → manual overrides bundled;
 * auto-fill never touches bundled brands, so their hand-made PNG stays). One
 * lookup map for rendering everywhere.
 */
export async function getResolvedBrandLogoMap(): Promise<Record<string, string>> {
  return { ...BRAND_LOGO_BY_DBNAME, ...(await getBrandLogoMap()) };
}

export async function setBrandLogo(brand: string, logoUrl: string, source: "manual" | "auto" = "manual"): Promise<void> {
  await q(
    `INSERT INTO brand_logos (brand, logo_url, source, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (brand) DO UPDATE SET logo_url = EXCLUDED.logo_url, source = EXCLUDED.source, updated_at = now()`,
    [brand, logoUrl, source],
  );
}

export async function deleteBrandLogo(brand: string): Promise<void> {
  await q("DELETE FROM brand_logos WHERE brand = $1", [brand]);
}

/**
 * Auto-fill logos from the CDN for the given brands that have a known domain
 * and no manual logo yet. Returns how many were set. Does NOT overwrite manual.
 */
export async function autoFillBrandLogos(brands: string[]): Promise<number> {
  const existing = await q<{ brand: string; source: string }>("SELECT brand, source FROM brand_logos");
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.brand));
  let n = 0;
  for (const brand of brands) {
    if (manual.has(brand)) continue;          // never clobber a hand-picked logo
    if (BRAND_LOGO_BY_DBNAME[brand]) continue; // keep the bundled hand-made PNG
    const domain = BRAND_DOMAINS[brand];
    if (!domain) continue;                     // unknown brand → leave as text
    await setBrandLogo(brand, cdnLogoUrl(domain), "auto");
    n++;
  }
  return n;
}
