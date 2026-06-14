// Backend layer: thin client for the WooCommerce Store API on the live
// maniagroup.com.ua WordPress install. This is our real product/category
// source until the catalog is migrated off WordPress.

const WC_BASE = "https://maniagroup.com.ua/wp-json/wc/store";
const REVALIDATE_SECONDS = 60 * 30; // 30 min

export type WcImage = { id: number; src: string; thumbnail: string; alt: string };

export type WcCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
};

export type WcProduct = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  prices: {
    price: string; // minor units, e.g. "1302000"
    regular_price: string;
    sale_price: string;
    currency_minor_unit: number;
    currency_symbol: string;
  };
  images: WcImage[];
  categories: { id: number; name: string; slug: string }[];
  is_in_stock: boolean;
  description: string;
  short_description: string;
  attributes: { id: number; name: string; taxonomy: string; terms: { id: number; name: string; slug: string }[] }[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
};

async function wcFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${WC_BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`WC API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCategories(): Promise<WcCategory[]> {
  return wcFetch<WcCategory[]>("/products/categories?per_page=100");
}

export async function fetchProducts(params: {
  perPage?: number;
  category?: number;
  orderby?: "date" | "price" | "popularity";
  order?: "asc" | "desc";
  search?: string;
  minPrice?: number; // UAH
  maxPrice?: number; // UAH
  sizeSlug?: string; // pa_size term slug
} = {}): Promise<WcProduct[]> {
  const qs = new URLSearchParams({
    per_page: String(params.perPage ?? 12),
    orderby: params.orderby ?? "date",
    order: params.order ?? "desc",
  });
  if (params.category) qs.set("category", String(params.category));
  if (params.search) qs.set("search", params.search);
  // WC stores prices in minor units (UAH × 100)
  if (params.minPrice) qs.set("min_price", String(params.minPrice * 100));
  if (params.maxPrice) qs.set("max_price", String(params.maxPrice * 100));
  if (params.sizeSlug) {
    qs.set("attributes[0][attribute]", "pa_size");
    qs.set("attributes[0][slug][]", params.sizeSlug);
  }
  return wcFetch<WcProduct[]>(`/products?${qs.toString()}`);
}

export async function fetchProductBySlug(slug: string): Promise<WcProduct | null> {
  const list = await wcFetch<WcProduct[]>(
    `/products?slug=${encodeURIComponent(slug)}`,
  );
  return list[0] ?? null;
}

/**
 * Fetch a single product by its numeric id. This is the reliable lookup on this
 * install: the Store API omits `slug` and ignores `?slug=` filtering, so slug
 * lookups silently returned the wrong (first) product.
 */
export async function fetchProductById(id: string | number): Promise<WcProduct | null> {
  if (!/^\d+$/.test(String(id))) return null;
  try {
    return await wcFetch<WcProduct>(`/products/${id}`);
  } catch {
    return null;
  }
}

/** Convert WC's minor-unit price string ("1302000") to UAH (1302). */
export function priceToUah(price: { price: string; currency_minor_unit: number }): number {
  return Math.round(Number(price.price) / 10 ** price.currency_minor_unit);
}
