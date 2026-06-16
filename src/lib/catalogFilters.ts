/**
 * Shared catalog-filter state + URL serialization. Client-safe (no server
 * imports) so the server page, the filter sidebar and the active-chips row all
 * build identical `/catalog?…` links from the same source of truth.
 */
export type ActiveFilters = {
  category?: string;
  brands: string[];
  brandGroup?: string;
  gender?: string;
  colors: string[];
  sizes: string[];
  seasons: string[];
  inStock: boolean;
  q?: string;
  sort: string;
  min?: string;
  max?: string;
};

/** Patch a subset of filters; arrays replace wholesale, scalars set/clear. */
export type FilterPatch = Partial<ActiveFilters>;

/** Build a `/catalog?…` href from the active filters plus an optional patch. */
export function catalogHref(active: ActiveFilters, patch: FilterPatch = {}): string {
  const next: ActiveFilters = { ...active, ...patch };
  const p = new URLSearchParams();
  if (next.category) p.set("category", next.category);
  if (next.brands.length) p.set("brands", next.brands.join(","));
  if (next.brandGroup) p.set("brandGroup", next.brandGroup);
  if (next.gender) p.set("gender", next.gender);
  if (next.colors.length) p.set("colors", next.colors.join(","));
  if (next.sizes.length) p.set("sizes", next.sizes.join(","));
  if (next.seasons.length) p.set("seasons", next.seasons.join(","));
  if (next.inStock) p.set("inStock", "1");
  if (next.q) p.set("q", next.q);
  if (next.min) p.set("min", next.min);
  if (next.max) p.set("max", next.max);
  if (next.sort && next.sort !== "newest") p.set("sort", next.sort);
  const qs = p.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

/** Toggle a value inside one of the array filters. */
export function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Count of distinct applied filters (for the mobile "Фільтри (n)" badge). */
export function activeCount(a: ActiveFilters): number {
  return (
    a.brands.length +
    a.colors.length +
    a.sizes.length +
    a.seasons.length +
    (a.category ? 1 : 0) +
    (a.brandGroup ? 1 : 0) +
    (a.gender ? 1 : 0) +
    (a.inStock ? 1 : 0) +
    (a.min || a.max ? 1 : 0)
  );
}

/** True when any removable filter is applied. */
export function hasAnyFilter(a: ActiveFilters): boolean {
  return activeCount(a) > 0 || !!a.q;
}
