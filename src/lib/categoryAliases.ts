/**
 * Old WooCommerce nav slugs → the store's own Postgres category slugs.
 *
 * The mega-menu (catalog.ts) and any indexed/bookmarked URLs still use the
 * WooCommerce-era category slugs (e.g. "aromatizatory", "muzhskie-polo"), but
 * the imported `products.category_slug` uses the store's own simplified slugs
 * ("aromatizator", "polo"), with gender kept in a separate column. Without this
 * mapping every such link lands on an empty catalog ("Товарів не знайдено").
 *
 * Resolved once in the catalog page so the title, facets, brands and product
 * query all use the correct DB slug. Only unambiguous mappings live here; group
 * categories ("Верхній одяг", "Аксесуари", …) and brand links are intentionally
 * left out — they need their own handling.
 */

type Alias = { category?: string; gender?: "men" | "women" };

const CATEGORY_ALIASES: Record<string, Alias> = {
  // Home fragrances — the DB has a single "aromatizator" category.
  aromatizatory: { category: "aromatizator" },
  aromadiffuzory: { category: "aromatizator" },
  aromaticheskiye_sashe: { category: "aromatizator" },
  interyernyye_dukhi: { category: "aromatizator" },
  smennyye_bloki: { category: "aromatizator" },
  // Gender-prefixed WC slugs → bare DB category + gender column.
  "muzhskie-polo": { category: "polo", gender: "men" },
  "muzhskie-rubashki": { category: "rubashka", gender: "men" },
  "muzhskaya-obuv": { category: "obuv", gender: "men" },
  "muzhskie-sumki": { category: "sumka", gender: "men" },
  "zhenskaya-obuv": { category: "obuv", gender: "women" },
  "zhenskie-platya": { category: "plate", gender: "women" },
  "zhenskie-sumki-i-ryukzaki": { category: "sumka", gender: "women" },
  // Gender-only umbrella entries.
  muzhskoe: { gender: "men" },
  zhenskoe: { gender: "women" },
};

/** Resolve a (possibly legacy) category slug + gender to the DB equivalents. */
export function resolveCatalogCategory(
  category?: string,
  gender?: string,
): { category?: string; gender?: string } {
  if (category && CATEGORY_ALIASES[category]) {
    const a = CATEGORY_ALIASES[category];
    return { category: a.category, gender: gender ?? a.gender };
  }
  return { category, gender };
}
