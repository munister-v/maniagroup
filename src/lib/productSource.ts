/**
 * Product source — Postgres only. Mania Group's own store engine is now the
 * single source of truth; WooCommerce is no longer queried at runtime (it is
 * only used by the one-shot import script in catalogImport.ts / wc-import).
 */

import type { Product } from "./catalog";
import { q, q1 } from "./pg";

// WcCategory shape kept for callers; categories now come from our own table.
export type WcCategory = { id: number; name: string; slug: string; parent: number; count: number };

// ── DB row → Product ────────────────────────────────────────────────────

const TONE_PALETTE = ["#c9bdab","#cbbfbd","#e3ddd1","#c4c2ac","#dccfb6","#cbb8a4","#c4bcb0","#d6d3cc"];

function toneFor(id: number): string {
  return TONE_PALETTE[id % TONE_PALETTE.length];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asImages(v: any): { src: string }[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAttrs(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): Product {
  const images = asImages(row.images);
  const regular = Number(row.regular_price);
  const sale = row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price);
  const onSale = sale !== null && sale < regular;
  const inStock = row.is_in_stock === true || row.is_in_stock === 1;
  const id = Number(row.id);

  return {
    id: String(row.id),
    slug: row.slug || String(row.id),
    name: row.name,
    brand: row.brand,
    price: onSale ? (sale as number) : regular,
    oldPrice: onSale ? regular : undefined,
    gender: row.gender === "men" ? "men" : "women",
    category: row.category,
    categorySlug: row.category_slug || undefined,
    tone: toneFor(id),
    tag: !inStock ? undefined : onSale ? "sale" : undefined,
    image: images[0]?.src || undefined,
    inStock,
    color: row.color || undefined,
    composition: row.composition || undefined,
    season: row.season || undefined,
  };
}

// ── Query params ─────────────────────────────────────────────────────────

export type CatalogQuery = {
  categorySlug?: string;
  brandName?: string;
  gender?: string;
  color?: string;
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
  source: "db";
};

// ── Core query ─────────────────────────────────────────────────────────

async function runQuery(params: CatalogQuery): Promise<CatalogResult> {
  const conds: string[] = ["status = 'publish'"];
  const bind: unknown[] = [];
  const p = (v: unknown) => { bind.push(v); return `$${bind.length}`; };

  if (params.q && params.q.trim()) {
    const term = params.q.trim();
    conds.push(`(name ILIKE ${p("%" + term + "%")} OR brand ILIKE ${p("%" + term + "%")} OR category ILIKE ${p("%" + term + "%")})`);
  }
  if (params.categorySlug) conds.push(`category_slug = ${p(params.categorySlug)}`);
  if (params.brandName)     conds.push(`brand = ${p(params.brandName)}`);
  if (params.gender)        conds.push(`gender = ${p(params.gender)}`);
  if (params.color)         conds.push(`color = ${p(params.color)}`);
  if (params.size)          conds.push(`attributes::text LIKE ${p('%"slug":"' + params.size + '"%')}`);
  if (params.minPrice)      conds.push(`price >= ${p(params.minPrice)}`);
  if (params.maxPrice)      conds.push(`price <= ${p(params.maxPrice)}`);

  const where = conds.join(" AND ");
  const order =
    params.orderby === "price"
      ? `ORDER BY is_in_stock DESC, price ${(params.order ?? "asc").toUpperCase() === "DESC" ? "DESC" : "ASC"}`
      : "ORDER BY is_in_stock DESC, id DESC";

  const limit = params.perPage ?? 24;
  const offset = ((params.page ?? 1) - 1) * limit;

  const rows = await q(
    `SELECT * FROM products WHERE ${where} ${order} LIMIT ${p(limit)} OFFSET ${p(offset)}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(
    `SELECT count(*)::text AS cnt FROM products WHERE ${where}`,
    bind.slice(0, bind.length - 2),
  );

  return { products: rows.map(rowToProduct), total: Number(countRow?.cnt ?? 0), source: "db" };
}

// ── Size facets ──────────────────────────────────────────────────────────

export async function dbSizeFacets(params: { categorySlug?: string; q?: string }): Promise<{ slug: string; name: string }[]> {
  const conds = ["status = 'publish'", "attributes::text != '[]'"];
  const bind: unknown[] = [];
  if (params.categorySlug) { bind.push(params.categorySlug); conds.push(`category_slug = $${bind.length}`); }

  const rows = await q<{ attributes: unknown }>(
    `SELECT attributes FROM products WHERE ${conds.join(" AND ")} LIMIT 500`,
    bind,
  );

  const map = new Map<string, string>();
  for (const row of rows) {
    for (const attr of asAttrs(row.attributes) as { taxonomy: string; terms: { name: string; slug: string }[] }[]) {
      if (attr.taxonomy === "pa_size") for (const t of attr.terms) map.set(t.slug, t.name);
    }
  }
  return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

// ── Categories ─────────────────────────────────────────────────────────

export async function getCatalogCategories(): Promise<WcCategory[]> {
  return q<WcCategory>(
    "SELECT id, name, slug, parent, count FROM categories ORDER BY count DESC, name ASC",
  );
}

// ── Single product ─────────────────────────────────────────────────────

export type DbProductDetail = {
  product: Product;
  images: { src: string }[];
  sizes: string[];
  composition?: string;
  color?: string;
  season?: string;
  country?: string;
  inStock: boolean;
};

export async function dbProductById(id: string): Promise<DbProductDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await q1<any>("SELECT * FROM products WHERE id = $1", [Number(id)]);
  if (!row) return null;
  const sizes = (asAttrs(row.attributes).find((a: { taxonomy: string }) => a.taxonomy === "pa_size")?.terms ?? [])
    .map((t: { name: string }) => t.name);
  const images = asImages(row.images).filter((i) => i?.src);
  return {
    product: rowToProduct(row),
    images,
    sizes,
    composition: row.composition || undefined,
    color: row.color || undefined,
    season: row.season || undefined,
    country: row.country || undefined,
    inStock: row.is_in_stock === true,
  };
}

// ── Brand facets ─────────────────────────────────────────────────────────

export async function dbBrands(filters?: { categorySlug?: string; gender?: string }): Promise<{ name: string; slug: string }[]> {
  const conds = ["is_in_stock = TRUE", "brand <> ''", "brand <> 'Mania Group'"];
  const bind: unknown[] = [];
  if (filters?.categorySlug) { bind.push(filters.categorySlug); conds.push(`category_slug = $${bind.length}`); }
  if (filters?.gender === "women" || filters?.gender === "men") { bind.push(filters.gender); conds.push(`gender = $${bind.length}`); }

  const rows = await q<{ brand: string }>(
    `SELECT brand, COUNT(*) n FROM products WHERE ${conds.join(" AND ")} GROUP BY brand ORDER BY n DESC`,
    bind,
  );
  return rows.map((r) => ({ name: r.brand, slug: brandSlug(r.brand) }));
}

// ── Color facets ───────────────────────────────────────────────────────────

export async function dbColorFacets(filters?: { categorySlug?: string; gender?: string }): Promise<{ name: string }[]> {
  const conds = ["is_in_stock = TRUE", "color <> ''", "status = 'publish'"];
  const bind: unknown[] = [];
  if (filters?.categorySlug) { bind.push(filters.categorySlug); conds.push(`category_slug = $${bind.length}`); }
  if (filters?.gender === "women" || filters?.gender === "men") { bind.push(filters.gender); conds.push(`gender = $${bind.length}`); }

  const rows = await q<{ color: string }>(
    `SELECT color, COUNT(*) n FROM products WHERE ${conds.join(" AND ")} GROUP BY color ORDER BY n DESC LIMIT 20`,
    bind,
  );
  return rows.map((r) => ({ name: r.color }));
}

/** Stable slug for a brand name, reversible via the facet map on the page. */
export function brandSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── Public API ───────────────────────────────────────────────────────────

export async function getProducts(params: CatalogQuery): Promise<CatalogResult> {
  return runQuery(params);
}

export async function getCatalogProducts(
  params: CatalogQuery & { categoryId?: number },
): Promise<CatalogResult> {
  return runQuery(params);
}

/** Curated products flagged `featured` for the homepage. In-stock first. */
export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  const rows = await q(
    `SELECT * FROM products WHERE featured AND status = 'publish'
     ORDER BY is_in_stock DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => rowToProduct(r));
}

/** Fetch a set of products by id, preserving the input order. */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const numeric = ids.map((s) => Number(s)).filter((n) => Number.isFinite(n));
  if (numeric.length === 0) return [];
  const rows = await q(`SELECT * FROM products WHERE id = ANY($1)`, [numeric]);
  const byId = new Map(rows.map((r) => [String((r as { id: unknown }).id), rowToProduct(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
}

/** UAH price passthrough (kept for callers that imported it from wc.ts). */
export function priceToUah(v: string | number): number {
  return typeof v === "number" ? v : Number(v) || 0;
}
