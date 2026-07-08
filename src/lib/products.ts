import { q, q1 } from "./pg";

/**
 * Admin-facing product CRUD for the CatalogGrid table (Postgres, `products`
 * table only — never touches `product_variants`). Manually created products
 * get ids in a high range (≥ 900000000) so they never collide with imported
 * WC ids.
 *
 * OWNERSHIP: this is the only layer that lets an admin edit a product's own
 * fields directly (name, price, category…). But `is_in_stock` here is a MIRROR
 * of product_variants.stock_qty maintained by lib/erp.ts — bulk-toggling
 * "В наявн." / "Немає" in the grid writes it directly, and that write gets
 * silently overwritten by the next stockImport.ts import or ERP stock edit.
 * See lib/erp.ts header for the full mirror contract.
 */

const ADMIN_ID_FLOOR = 900_000_000;

export type SizeQty = { size: string; qty: number };

export type AdminProductInput = {
  name: string;
  slug?: string;
  sku?: string;
  factory_article?: string; // bridge code an OFFERS (ОСТАТКИ) file matches on — see lib/erp.ts header
  brand?: string;
  category?: string;
  category_slug?: string;
  gender?: string;
  regular_price: number;
  sale_price?: number | null;
  is_in_stock?: boolean;
  status?: string;
  /** Publish this product even without a photo (per-product override of the
   *  site-wide "require_product_photo" setting) — see lib/productSource.ts. */
  show_without_photo?: boolean;
  image_src?: string;
  images?: { src: string }[];
  sizes?: SizeQty[];
  description?: string;
  short_description?: string;
  color?: string;
  country?: string;
  season?: string;
  collection?: string;
  composition?: string;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-+|-+$/g, "");
}

function sizeAttributes(sizes: SizeQty[] | undefined): string {
  if (!sizes || sizes.length === 0) return "[]";
  return JSON.stringify([
    {
      taxonomy: "pa_size",
      name: "Розмір",
      terms: sizes.map((s) => ({ name: s.size, slug: slugify(s.size) || s.size })),
    },
  ]);
}

/**
 * Sync real product_variants rows from a manually-entered size/qty list, then
 * recompute the products.stock_qty/is_in_stock mirror from them (same pattern
 * as lib/erp.ts / lib/stockImport.ts). Without this, a product created by hand
 * via "Новий товар" has no variants at all — no real per-size stock for the
 * storefront's size selector, and nothing for a future ОСТАТКИ file to ever
 * find via offer_code/barcode. Sizes with an empty name are skipped.
 */
async function syncManualVariants(productId: number, sizes: SizeQty[]): Promise<void> {
  const clean = sizes.filter((s) => s.size.trim());
  for (const s of clean) {
    await q(
      `INSERT INTO product_variants (product_id, size, stock_qty, active, updated_at, updated_by)
       VALUES ($1, $2, $3, TRUE, now(), 'admin')
       ON CONFLICT (product_id, size) DO UPDATE SET
         stock_qty = EXCLUDED.stock_qty, active = TRUE, updated_at = now(), updated_by = 'admin'`,
      [productId, s.size.trim(), Math.max(0, Math.round(s.qty) || 0)],
    );
  }
  const keepSizes = clean.map((s) => s.size.trim());
  await q(
    `UPDATE product_variants SET active = FALSE, updated_at = now()
      WHERE product_id = $1 AND NOT (size = ANY($2::text[]))`,
    [productId, keepSizes],
  );
  await q(
    `UPDATE products p SET
        stock_qty = sub.total, is_in_stock = (sub.total > 0), updated_at = now()
      FROM (SELECT COALESCE(SUM(stock_qty), 0) AS total FROM product_variants WHERE product_id = $1 AND active) sub
      WHERE p.id = $1`,
    [productId],
  );
}

// Columns the grid can sort by — whitelisted to keep ORDER BY injection-safe.
const SORTABLE: Record<string, string> = {
  id: "id", name: "name", brand: "brand", sku: "sku", category: "category",
  gender: "gender", regular_price: "regular_price", sale_price: "sale_price",
  price: "price", is_in_stock: "is_in_stock", status: "status", color: "color",
  season: "season",
};

export type ProductFilterOpts = {
  q?: string;
  stock?: "in" | "out";
  brand?: string;
  category?: string;   // category_slug
  gender?: "men" | "women";
  color?: string;
  season?: string;     // matches season ILIKE %…%
  minPrice?: number;
  maxPrice?: number;
  status?: "publish" | "draft"; // omit = any
  /** Derived "is this visible on the storefront right now" bucket — see
   *  siteStatus() in CatalogGrid.tsx for the matching client-side logic. */
  siteStatus?: "live" | "no_photo" | "out_of_stock" | "hidden";
};

/** Parse the shared catalog filter params from a URL query (list + export). */
export function parseFilterParams(sp: URLSearchParams): ProductFilterOpts {
  const stock = sp.get("stock");
  const gender = sp.get("gender");
  const status = sp.get("status");
  const min = sp.get("minPrice");
  const max = sp.get("maxPrice");
  const siteStatus = sp.get("siteStatus");
  return {
    q: sp.get("q") || undefined,
    stock: stock === "in" || stock === "out" ? stock : undefined,
    brand: sp.get("brand") || undefined,
    category: sp.get("category") || undefined,
    gender: gender === "men" || gender === "women" ? gender : undefined,
    color: sp.get("color") || undefined,
    season: sp.get("season") || undefined,
    minPrice: min ? Number(min) : undefined,
    maxPrice: max ? Number(max) : undefined,
    status: status === "publish" || status === "draft" ? status : undefined,
    siteStatus: siteStatus === "live" || siteStatus === "no_photo" || siteStatus === "out_of_stock" || siteStatus === "hidden" ? siteStatus : undefined,
  };
}

function buildProductFilters(opts: ProductFilterOpts) {
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q) {
    bind.push(`%${opts.q}%`);
    const i = bind.length;
    // Extended search: name / brand / sku (+ normalized) / factory_article,
    // plus variant barcode & offer_code via EXISTS (find a product by a size code).
    conds.push(`(name ILIKE $${i} OR brand ILIKE $${i} OR sku ILIKE $${i}
      OR replace(replace(replace(replace(sku,' ',''),'-',''),'.',''),'_','') ILIKE $${i}
      OR factory_article ILIKE $${i}
      OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = products.id
                 AND (v.barcode ILIKE $${i} OR v.offer_code ILIKE $${i})))`);
  }
  if (opts.stock === "in") conds.push("is_in_stock = TRUE");
  if (opts.stock === "out") conds.push("is_in_stock = FALSE");
  if (opts.brand) { bind.push(opts.brand); conds.push(`brand = $${bind.length}`); }
  if (opts.category) { bind.push(opts.category); conds.push(`category_slug = $${bind.length}`); }
  if (opts.gender) { bind.push(opts.gender); conds.push(`gender = $${bind.length}`); }
  if (opts.color) { bind.push(opts.color); conds.push(`color = $${bind.length}`); }
  if (opts.season) { bind.push(`%${opts.season}%`); conds.push(`season ILIKE $${bind.length}`); }
  if (opts.minPrice != null) { bind.push(opts.minPrice); conds.push(`price >= $${bind.length}`); }
  if (opts.maxPrice != null) { bind.push(opts.maxPrice); conds.push(`price <= $${bind.length}`); }
  if (opts.status) { bind.push(opts.status); conds.push(`status = $${bind.length}`); }
  // Same "has a real photo" check the storefront uses (lib/productSource.ts
  // hasImg) — keeps this filter honest about what's actually visible.
  const hasImg = `(images IS NOT NULL AND images::text NOT IN ('[]','null',''))`;
  // A per-product "show_without_photo" override (Каталог → «Показати без
  // фото») counts as LIVE here regardless of the site-wide photo setting.
  if (opts.siteStatus === "live")         conds.push(`status = 'publish' AND is_in_stock = TRUE AND (${hasImg} OR show_without_photo)`);
  if (opts.siteStatus === "no_photo")     conds.push(`status = 'publish' AND is_in_stock = TRUE AND NOT ${hasImg} AND NOT show_without_photo`);
  if (opts.siteStatus === "out_of_stock") conds.push(`status = 'publish' AND is_in_stock = FALSE`);
  if (opts.siteStatus === "hidden")       conds.push(`status <> 'publish'`);
  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", bind };
}

/** Extract a comma-joined size list from the attributes JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sizesFromAttributes(attrs: any): string {
  const a = typeof attrs === "string" ? safeParse(attrs) : attrs;
  if (!Array.isArray(a)) return "";
  const size = a.find((x: { taxonomy?: string }) => x?.taxonomy === "pa_size");
  return (size?.terms ?? []).map((t: { name: string }) => t.name).join(", ");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParse(s: string): any { try { return JSON.parse(s); } catch { return []; } }

export async function listAdminProducts(opts: ProductFilterOpts & {
  page?: number; perPage?: number; sortBy?: string; sortDir?: "asc" | "desc";
} = {}) {
  const perPage = Math.min(Math.max(opts.perPage ?? 30, 1), 300);
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const { where, bind } = buildProductFilters(opts);
  const col = SORTABLE[opts.sortBy ?? "id"] ?? "id";
  const dir = opts.sortDir === "asc" ? "ASC" : "DESC";
  const rows = await q(
    `SELECT id::text AS id, name, slug, sku, brand, category, category_slug, gender,
            regular_price::float AS regular_price, sale_price::float AS sale_price,
            price::float AS price, is_in_stock, status, image_src, featured, show_without_photo,
            color, season, composition, country, attributes, factory_article,
            to_char(updated_at, 'DD.MM.YYYY HH24:MI') AS updated_at,
            EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = products.id AND v.active) AS has_variants
     FROM products ${where} ORDER BY ${col} ${dir} NULLS LAST, id DESC LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM products ${where}`, bind);
  const products = rows.map((r) => {
    const { attributes, ...rest } = r as Record<string, unknown>;
    return { ...rest, sizes: sizesFromAttributes(attributes) };
  });
  return { products, total: Number(countRow?.cnt ?? 0) };
}

export type ExportRow = {
  id: string; sku: string; name: string; brand: string; category: string; gender: string;
  regular_price: number; sale_price: number | null; price: number;
  is_in_stock: boolean; status: string; color: string; season: string;
  composition: string; country: string; slug: string; image_src: string; sizes: string;
};

/** All matching rows (no pagination) for export — flattened, export-ready. */
export async function exportAdminProducts(opts: ProductFilterOpts & { ids?: string[] } = {}): Promise<ExportRow[]> {
  const { where, bind } = buildProductFilters(opts);
  let finalWhere = where;
  if (opts.ids && opts.ids.length) {
    bind.push(opts.ids.map((n) => Number(n)));
    finalWhere = `${where ? where + " AND" : "WHERE"} id = ANY($${bind.length})`;
  }
  const rows = await q(
    `SELECT id::text AS id, sku, name, brand, category, gender,
            regular_price::float AS regular_price, sale_price::float AS sale_price,
            price::float AS price, is_in_stock, status, color, season, composition,
            country, slug, image_src, attributes
     FROM products ${finalWhere} ORDER BY id DESC`,
    bind,
  );
  return rows.map((r) => {
    const { attributes, ...rest } = r as Record<string, unknown>;
    return { ...rest, sizes: sizesFromAttributes(attributes) } as ExportRow;
  });
}

/** Apply per-field edits to many products at once (spreadsheet bulk save). */
export async function bulkUpdateProducts(
  updates: { id: string; fields: Partial<AdminProductInput> }[],
): Promise<number> {
  let n = 0;
  for (const u of updates) {
    if (!u.id || !u.fields || Object.keys(u.fields).length === 0) continue;
    await updateAdminProduct(u.id, u.fields);
    n++;
  }
  return n;
}

export async function getAdminProduct(id: string) {
  const product = await q1<Record<string, unknown>>(`SELECT *, id::text AS id FROM products WHERE id = $1`, [Number(id)]);
  if (!product) return product;
  const variants = await q<{ size: string; stock_qty: number }>(
    `SELECT size, stock_qty FROM product_variants WHERE product_id = $1 AND active ORDER BY size`,
    [Number(id)],
  );
  return { ...product, variants };
}

export async function createAdminProduct(input: AdminProductInput): Promise<{ id: string }> {
  const idRow = await q1<{ next: string }>(
    `SELECT (GREATEST(COALESCE(MAX(id),0), $1) + 1)::text AS next FROM products`,
    [ADMIN_ID_FLOOR],
  );
  const id = Number(idRow!.next);
  const slug = input.slug || String(id);
  const price = input.sale_price && input.sale_price > 0 && input.sale_price < input.regular_price
    ? input.sale_price
    : input.regular_price;

  await q(
    `INSERT INTO products
      (id, sku, factory_article, name, slug, brand, category, category_slug, gender,
       price, regular_price, sale_price, is_in_stock, status,
       image_src, images, attributes, description, short_description,
       color, country, season, collection, composition)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      id, input.sku ?? "", input.factory_article ?? "", input.name, slug, input.brand ?? "Mania Group",
      input.category ?? "Одяг", input.category_slug || slugify(input.category ?? "tovar") || "tovar",
      input.gender ?? "", price, input.regular_price, input.sale_price ?? null,
      input.is_in_stock ?? true, input.status ?? "publish",
      input.image_src ?? input.images?.[0]?.src ?? "",
      JSON.stringify(input.images ?? (input.image_src ? [{ src: input.image_src }] : [])),
      sizeAttributes(input.sizes), input.description ?? "", input.short_description ?? "",
      input.color ?? "", input.country ?? "", input.season ?? "", input.collection ?? "", input.composition ?? "",
    ],
  );
  if (input.sizes && input.sizes.length > 0) await syncManualVariants(id, input.sizes);
  return { id: String(id) };
}

export async function updateAdminProduct(id: string, input: Partial<AdminProductInput>): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };

  if (input.name !== undefined) add("name", input.name);
  if (input.slug !== undefined) add("slug", input.slug);
  if (input.sku !== undefined) add("sku", input.sku);
  if (input.factory_article !== undefined) add("factory_article", input.factory_article);
  if (input.brand !== undefined) add("brand", input.brand);
  if (input.category !== undefined) add("category", input.category);
  if (input.category_slug !== undefined) add("category_slug", input.category_slug);
  if (input.gender !== undefined) add("gender", input.gender);
  if (input.regular_price !== undefined) add("regular_price", input.regular_price);
  if (input.sale_price !== undefined) add("sale_price", input.sale_price);
  if (input.is_in_stock !== undefined) add("is_in_stock", input.is_in_stock);
  if (input.status !== undefined) add("status", input.status);
  if (input.show_without_photo !== undefined) add("show_without_photo", input.show_without_photo);
  if (input.image_src !== undefined) add("image_src", input.image_src);
  if (input.images !== undefined) add("images", JSON.stringify(input.images));
  if (input.sizes !== undefined) add("attributes", sizeAttributes(input.sizes));
  if (input.description !== undefined) add("description", input.description);
  if (input.short_description !== undefined) add("short_description", input.short_description);
  if (input.color !== undefined) add("color", input.color);
  if (input.country !== undefined) add("country", input.country);
  if (input.season !== undefined) add("season", input.season);
  if (input.collection !== undefined) add("collection", input.collection);
  if (input.composition !== undefined) add("composition", input.composition);

  add("updated_at", new Date().toISOString());

  if (sets.length > 0) {
    bind.push(Number(id));
    await q(`UPDATE products SET ${sets.join(", ")} WHERE id = $${bind.length}`, bind);

    // Recompute effective price from the now-current row when prices changed.
    if (input.regular_price !== undefined || input.sale_price !== undefined) {
      await q(
        `UPDATE products SET price = CASE
           WHEN sale_price IS NOT NULL AND sale_price > 0 AND sale_price < regular_price
           THEN sale_price ELSE regular_price END
         WHERE id = $1`,
        [Number(id)],
      );
    }
  }

  // Sync real per-size stock rows + mirror whenever sizes were touched at all
  // (including clearing them to []) — see syncManualVariants for why this
  // matters for both the storefront size selector and future ОСТАТКИ matches.
  if (input.sizes !== undefined) await syncManualVariants(Number(id), input.sizes);
}

export async function deleteAdminProduct(id: string): Promise<void> {
  await q("DELETE FROM products WHERE id = $1", [Number(id)]);
}

/**
 * Wipes the ENTIRE catalog — every product, cascading to product_variants
 * (ON DELETE CASCADE). order_items/wishlist/cart/stock_movements rows that
 * reference a deleted product_id are intentionally left in place (no FK to
 * products on those tables) so past orders stay intact; only the live
 * catalog is cleared. Callers MUST take a fresh backup first — see
 * /api/admin/products/wipe, which is the only caller and enforces this.
 */
export async function wipeAllProducts(): Promise<number> {
  const rows = await q<{ id: string }>("DELETE FROM products RETURNING id");
  return rows.length;
}

export type BulkAction = "publish" | "unpublish" | "in_stock" | "out_of_stock" | "feature" | "unfeature" | "show_without_photo" | "hide_without_photo" | "delete";

export async function bulkProducts(ids: string[], action: BulkAction): Promise<{ count: number; skipped: number }> {
  const nums = ids.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return { count: 0, skipped: 0 };
  // Products with real size variants have their is_in_stock mirrored from
  // variant stock (lib/erp.ts / syncManualVariants) — a bulk toggle here
  // would silently get overwritten by the next import/card edit, so those
  // ids are excluded rather than lied to. Products with no variants have no
  // other source of truth, so the manual toggle stays fully in effect there.
  const hasVariants = `EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = products.id AND v.active)`;
  switch (action) {
    case "publish":
      await q("UPDATE products SET status = 'publish', updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "unpublish":
      await q("UPDATE products SET status = 'draft', updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "in_stock": {
      const r = await q(`UPDATE products SET is_in_stock = TRUE, updated_at = now() WHERE id = ANY($1) AND NOT ${hasVariants} RETURNING id`, [nums]);
      return { count: r.length, skipped: nums.length - r.length };
    }
    case "out_of_stock": {
      const r = await q(`UPDATE products SET is_in_stock = FALSE, updated_at = now() WHERE id = ANY($1) AND NOT ${hasVariants} RETURNING id`, [nums]);
      return { count: r.length, skipped: nums.length - r.length };
    }
    case "feature":
      await q("UPDATE products SET featured = TRUE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "unfeature":
      await q("UPDATE products SET featured = FALSE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "show_without_photo":
      await q("UPDATE products SET show_without_photo = TRUE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "hide_without_photo":
      await q("UPDATE products SET show_without_photo = FALSE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "delete":
      await q("DELETE FROM products WHERE id = ANY($1)", [nums]); break;
    default:
      throw new Error("Невідома дія");
  }
  return { count: nums.length, skipped: 0 };
}

export type PriceRuleScope = { brand?: string; categorySlug?: string; ids?: string[] };

/**
 * Bulk price adjustment. percent>0 sets a sale price = regular × (1 − percent/100);
 * percent=0 clears the sale (back to regular). Scoped by brand, category, or ids.
 */
export async function applyPriceRule(scope: PriceRuleScope, percent: number): Promise<number> {
  const conds: string[] = ["regular_price > 0"];
  const bind: unknown[] = [];
  if (scope.brand) { bind.push(scope.brand); conds.push(`brand = $${bind.length}`); }
  if (scope.categorySlug) { bind.push(scope.categorySlug); conds.push(`category_slug = $${bind.length}`); }
  if (scope.ids && scope.ids.length) {
    bind.push(scope.ids.map(Number).filter(Number.isFinite));
    conds.push(`id = ANY($${bind.length})`);
  }
  const where = conds.join(" AND ");

  if (percent > 0) {
    bind.push(1 - percent / 100);
    const rows = await q(
      `UPDATE products
         SET sale_price = round(regular_price * $${bind.length}),
             price = round(regular_price * $${bind.length}),
             updated_at = now()
       WHERE ${where} RETURNING id`,
      bind,
    );
    return rows.length;
  }
  // Clear sale: back to regular price.
  const rows = await q(
    `UPDATE products SET sale_price = NULL, price = regular_price, updated_at = now() WHERE ${where} RETURNING id`,
    bind,
  );
  return rows.length;
}

/** Distinct brand list with product counts (for price-rule + filters). */
export async function listBrandsWithCounts(): Promise<{ brand: string; count: number }[]> {
  return q<{ brand: string; count: number }>(
    `SELECT brand, count(*)::int AS count FROM products
     WHERE brand <> '' GROUP BY brand ORDER BY count DESC, brand ASC`,
  );
}
