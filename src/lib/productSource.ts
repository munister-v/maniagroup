/**
 * Hybrid product source: reads from SQLite when available, falls back to
 * WooCommerce Store API. The catalog page calls only this layer and never
 * touches wc.ts directly — makes the future cut-over zero-risk.
 */

import type { Product } from "./catalog";
import type { WcCategory } from "./wc";
import { fetchProducts, fetchCategories, priceToUah } from "./wc";
import { fromWcProduct } from "./catalog";
import { getDb, isDbReady } from "./db";

// ── DB row → Product ────────────────────────────────────────────────────

const TONE_PALETTE = ["#c9bdab","#cbbfbd","#e3ddd1","#c4c2ac","#dccfb6","#cbb8a4","#c4bcb0","#d6d3cc"];

function toneFor(id: number): string {
  return TONE_PALETTE[id % TONE_PALETTE.length];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): Product {
  const images: { src: string }[] = JSON.parse(row.images ?? "[]");
  const onSale = row.sale_price !== null && row.sale_price < row.regular_price;

  return {
    id: String(row.id),
    slug: row.slug || String(row.id),
    name: row.name,
    brand: row.brand,
    price: onSale ? (row.sale_price as number) : (row.regular_price as number),
    oldPrice: onSale ? (row.regular_price as number) : undefined,
    gender: "women",                    // approximation: catalog page doesn't use it
    category: row.category,
    categorySlug: row.category_slug || undefined,
    tone: toneFor(row.id as number),
    tag: onSale ? "sale" : undefined,
    image: images[0]?.src,
  };
}

// ── Query params ─────────────────────────────────────────────────────────

export type CatalogQuery = {
  categorySlug?: string;
  q?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  orderby?: "price" | "date";
  order?: "asc" | "desc";
  page?: number;
  perPage?: number;
};

export type CatalogResult = {
  products: Product[];
  total: number;
  source: "db" | "wc";
};

// ── SQLite query ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbQuery(params: CatalogQuery): CatalogResult {
  const db = getDb()!;

  const conditions: string[] = ["p.status = 'publish'"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bind: Record<string, any> = {};
  let useFts = false;

  if (params.q) {
    useFts = true;
    bind.q = params.q.trim().split(/\s+/).map((w) => `"${w}"*`).join(" ");
  }
  if (params.categorySlug) {
    conditions.push("p.category_slug = @cat");
    bind.cat = params.categorySlug;
  }
  if (params.size) {
    conditions.push(`p.attributes LIKE @size`);
    bind.size = `%"slug":"${params.size}"%`;
  }
  if (params.minPrice) {
    conditions.push("p.price >= @minP");
    bind.minP = params.minPrice;
  }
  if (params.maxPrice) {
    conditions.push("p.price <= @maxP");
    bind.maxP = params.maxPrice;
  }

  const fromClause = useFts
    ? "FROM products p JOIN products_fts ON products_fts.rowid = p.id AND products_fts MATCH @q"
    : "FROM products p";

  const where = conditions.join(" AND ");

  let orderClause: string;
  if (params.orderby === "price") {
    orderClause = `ORDER BY p.price ${(params.order ?? "asc").toUpperCase()}`;
  } else {
    orderClause = "ORDER BY p.id DESC"; // newest first by default
  }

  const limit = params.perPage ?? 24;
  const offset = ((params.page ?? 1) - 1) * limit;

  const rows = db
    .prepare(`SELECT p.* ${fromClause} WHERE ${where} ${orderClause} LIMIT ${limit} OFFSET ${offset}`)
    .all(bind) as Record<string, unknown>[];

  const { cnt } = db
    .prepare(`SELECT COUNT(*) as cnt ${fromClause} WHERE ${where}`)
    .get(bind) as { cnt: number };

  return {
    products: rows.map(rowToProduct),
    total: cnt,
    source: "db",
  };
}

// ── Size facets from DB ──────────────────────────────────────────────────

export function dbSizeFacets(params: { categorySlug?: string; q?: string }): { slug: string; name: string }[] {
  const db = getDb();
  if (!db) return [];

  const conditions = ["status = 'publish'", "attributes != '[]'"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bind: Record<string, any> = {};
  if (params.categorySlug) {
    conditions.push("category_slug = @cat");
    bind.cat = params.categorySlug;
  }

  const rows = db
    .prepare(`SELECT attributes FROM products WHERE ${conditions.join(" AND ")} LIMIT 500`)
    .all(bind) as { attributes: string }[];

  const map = new Map<string, string>();
  for (const row of rows) {
    try {
      const attrs: { taxonomy: string; terms: { name: string; slug: string }[] }[] = JSON.parse(row.attributes);
      for (const attr of attrs) {
        if (attr.taxonomy === "pa_size") {
          for (const t of attr.terms) map.set(t.slug, t.name);
        }
      }
    } catch { /* skip invalid JSON */ }
  }
  return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}

// ── Category facets from DB ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbCategories(): WcCategory[] {
  const db = getDb()!;
  return db
    .prepare("SELECT id, name, slug, parent, count FROM categories ORDER BY count DESC, name ASC")
    .all() as WcCategory[];
}

// ── Public API ───────────────────────────────────────────────────────────

export async function getProducts(params: CatalogQuery): Promise<CatalogResult> {
  if (isDbReady()) {
    try {
      return dbQuery(params);
    } catch (e) {
      console.warn("[productSource] DB query failed, falling back to WC:", e);
    }
  }

  // WC Store API fallback
  const wcProducts = await fetchProducts({
    perPage: params.perPage ?? 24,
    category: undefined, // no id here; handled by catalog/page.tsx lookup
    search: params.q,
    orderby: params.orderby === "price" ? "price" : "date",
    order: params.order ?? "desc",
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    sizeSlug: params.size,
  }).catch(() => []);

  return {
    products: wcProducts.map(fromWcProduct),
    total: wcProducts.length,
    source: "wc",
  };
}

export async function getCatalogProducts(
  params: CatalogQuery & { categoryId?: number }
): Promise<CatalogResult> {
  if (isDbReady()) {
    try {
      return dbQuery(params);
    } catch (e) {
      console.warn("[productSource] DB query failed, falling back to WC:", e);
    }
  }

  // WC fallback (needs category id, not slug)
  const wcProducts = await fetchProducts({
    perPage: params.perPage ?? 24,
    category: params.categoryId,
    search: params.q,
    orderby: params.orderby === "price" ? "price" : "date",
    order: params.order ?? "desc",
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    sizeSlug: params.size,
  }).catch(() => []);

  return {
    products: wcProducts.map(fromWcProduct),
    total: wcProducts.length,
    source: "wc",
  };
}

export async function getCatalogCategories(): Promise<WcCategory[]> {
  if (isDbReady()) {
    try {
      return dbCategories();
    } catch { /* fall through */ }
  }
  return fetchCategories().catch(() => []);
}

// Re-export priceToUah for callers that used wc.ts
export { priceToUah };
