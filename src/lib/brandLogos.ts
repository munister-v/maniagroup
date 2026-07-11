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
import { downloadLogoForBrand, hasLocalLogo, localLogoUrl, clearLocalLogo, type LogoBg } from "./logoDownloader";

export type BrandLogoRow = { brand: string; logo_url: string; source: "manual" | "auto"; bg: LogoBg };

/** Curated domains for well-known brands in the catalog (best-effort). */
const BRAND_DOMAINS: Record<string, string> = {
  // Armani family
  EA7: "armani.com",
  "EA7 Swim": "armani.com",
  "EA7 underwear": "armani.com",
  "ARMANI JEANS": "armani.com",
  "ARMANI EXCHANGE": "armaniexchange.com",
  // Moschino family
  "MOSCHINO Love": "moschino.com",
  "MOSCHINO u.wear": "moschino.com",
  "MOSCHINO beach.wear": "moschino.com",
  "MOSCHINO JEANS": "moschino.com",
  // Trussardi family
  "TRUSSARDI JEANS": "trussardi.com",
  "TRUSSARDI ACTION": "trussardi.com",
  "TRU TRUSSARDI": "trussardi.com",
  // Richmond family
  "JOHN RICHMOND": "johnrichmond.com",
  "RICHMOND X": "johnrichmond.com",
  // Versace / Cavalli
  "VERSACE JEANS": "versace.com",
  "VERSACE SPORT": "versace.com",
  "JUST CAVALLI": "robertocavalli.com",
  "CLASS CAVALLI": "robertocavalli.com",
  // Twin Set / Bikkembergs
  "TWIN SET": "twinset.com",
  "TWIN SET MILANO": "twinset.com",
  BIKKEMBERGS: "bikkembergs.com",
  "DIRK BIKKEMBERGS": "bikkembergs.com",
  // D&G
  "D&G": "dolcegabbana.com",
  "DOLCE&GABBANA": "dolcegabbana.com",
  // Ferre
  "GF FERRE": "gianfrancoferre.com",
  "FERRE COLLEZIONI": "gianfrancoferre.com",
  // Single entries
  "HARMONT&BLAINE": "harmontblaine.com",
  PINKO: "pinko.com",
  "FRED MELLO": "fredmello.com",
  KOCCA: "kocca.it",
  "MC2 SAINT BARTH": "mc2saintbarth.com",
  "ANTONY MORATO": "antonymorato.com",
  LANCASTER: "lancaster-paris.com",
  "ICE ICEBERG": "iceberg.com",
  "ICE PLAY": "iceplay.com",
  BOMBOOGIE: "bomboogie.com",
  BLUGIRL: "blumarine.com",
  DSQUARED: "dsquared2.com",
  "MISSONI M": "missoni.com",
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
  "ARMATA DI MARE": "armatadimare.it",
  SFIZIO: "sfizio.it",
  NOSECRETS: "nosecrets.it",
  MANGANO: "mangano.it",
  "AFTER LABEL": "afterlabel.it",
  BLAUER: "blauerusa.com",
  IBLUES: "iblues.com",
  DUVETICA: "duvetica.com",
  "FRANKIE MORELLO": "frankiemorello.com",
  GEOSPIRIT: "geospirit.it",
  KONTATTO: "kontatto.it",
  PARASUCO: "parasuco.com",
  "PARASUCO CULT": "parasuco.com",
  "Y-3": "y-3.com",
  FENDI: "fendi.com",
  GUCCI: "gucci.com",
  PRADA: "prada.com",
  "PRADA sport": "prada.com",
  "MISS SIXTY": "misssixty.com",
  BARBATI: "barbati.it",
  BAGUTTA: "bagutta.it",
  DIADORA: "diadora.com",
  UGG: "ugg.com",
  BELSTAFF: "belstaff.com",
  "EMILIO PUCCI": "emiliopucci.com",
  REFRIGIWEAR: "refrigiwear.com",
  "SCUOLA NAUTICA ITALIANA": "scuolanauticaitaliana.it",
  "DIOR u.wear": "dior.com",
  "SEVEN 7": "seven7.com",
  "J.B4 (Just Before)": "jb4italy.com",
  "VDP sport": "vdp.it",
  "UP TO BE": "uptobe.it",
  MARVILLE: "marville-marine.com",
  "SUNS BOARDS": "sunsboards.com",
  CNC: "costumenational.com",
  EMU: "emuaustralia.com",
};

/** @deprecated Clearbit is shut down — use downloadLogoForBrand instead. */
export function cdnLogoUrl(_domain: string): string {
  return "";
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
  return q<BrandLogoRow>("SELECT brand, logo_url, source, bg FROM brand_logos ORDER BY brand");
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

/** Brands whose stored logo is a solid dark fill and needs a dark tile.
 *  Bundled logos are all transparent dark-ink wordmarks → always 'light'. */
export async function getBrandLogoBgMap(): Promise<Record<string, LogoBg>> {
  const rows = await q<{ brand: string; bg: LogoBg }>("SELECT brand, bg FROM brand_logos");
  const out: Record<string, LogoBg> = {};
  for (const r of rows) out[r.brand] = r.bg;
  return out;
}

export async function setBrandLogo(
  brand: string, logoUrl: string, source: "manual" | "auto" = "manual", bg: LogoBg = "light",
): Promise<void> {
  await q(
    `INSERT INTO brand_logos (brand, logo_url, source, bg, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (brand) DO UPDATE SET logo_url = EXCLUDED.logo_url, source = EXCLUDED.source, bg = EXCLUDED.bg, updated_at = now()`,
    [brand, logoUrl, source, bg],
  );
}

export async function deleteBrandLogo(brand: string): Promise<void> {
  await q("DELETE FROM brand_logos WHERE brand = $1", [brand]);
}

/**
 * Downloads logos locally for the given brands and saves them to disk.
 * Stores the local `/uploads/brands/…` path in DB instead of an external URL.
 * Does NOT overwrite manual logos. Returns { attempted, saved }.
 */
export async function autoFillBrandLogos(brands: string[]): Promise<number> {
  const existing = await q<{ brand: string; source: string }>("SELECT brand, source FROM brand_logos");
  const manual = new Set(existing.filter((e) => e.source === "manual").map((e) => e.brand));
  let n = 0;
  for (const brand of brands) {
    if (manual.has(brand)) continue;
    if (BRAND_LOGO_BY_DBNAME[brand]) continue;
    const domain = BRAND_DOMAINS[brand];
    if (!domain) continue;
    const logo = await downloadLogoForBrand(brand, domain);
    if (logo) {
      await setBrandLogo(brand, logo.url, "auto", logo.bg);
      n++;
    }
  }
  return n;
}

/**
 * Downloads all known-domain brands locally. Overwrites auto-sourced entries;
 * never touches manual logos or bundled brands. With `force`, re-fetches even
 * brands that already have a cached file (used to upgrade old low-quality
 * favicon-tier logos to high-res Logo.dev ones) — a brand Logo.dev no longer
 * serves at ≥64px gets its stale file + auto DB row PURGED so it falls back to
 * the clean text wordmark instead of keeping a blurry favicon.
 * Returns counts: { attempted, saved, skipped, purged }.
 */
export async function downloadAllBrandLogos(force = false): Promise<{ attempted: number; saved: number; skipped: number; purged: number }> {
  const existing = await q<{ brand: string; source: string; logo_url: string }>(
    "SELECT brand, source, logo_url FROM brand_logos",
  );
  const manualSet = new Set(existing.filter((e) => e.source === "manual").map((e) => e.brand));

  let attempted = 0;
  let saved = 0;
  let skipped = 0;
  let purged = 0;

  for (const [brand, domain] of Object.entries(BRAND_DOMAINS)) {
    if (manualSet.has(brand)) { skipped++; continue; }
    if (BRAND_LOGO_BY_DBNAME[brand]) { skipped++; continue; }
    attempted++;

    // Non-force + already cached: just make sure the DB entry is correct.
    if (!force && hasLocalLogo(brand)) {
      const logo = await downloadLogoForBrand(brand, domain); // returns cached url + re-derived bg
      if (logo) { await setBrandLogo(brand, logo.url, "auto", logo.bg); saved++; }
      continue;
    }

    const logo = await downloadLogoForBrand(brand, domain, force);
    if (logo) {
      await setBrandLogo(brand, logo.url, "auto", logo.bg);
      saved++;
    } else if (force) {
      // Logo.dev no longer has a usable ≥64px logo — drop the stale file and
      // the auto row so the UI falls back to a clean text wordmark.
      clearLocalLogo(brand);
      await q("DELETE FROM brand_logos WHERE brand = $1 AND source = 'auto'", [brand]);
      purged++;
    }
  }

  return { attempted, saved, skipped, purged };
}
