/**
 * ERP data layer — the admin/ERP as system of record for assortment & stock.
 *
 * A product breaks into per-size variants (product_variants). The bookkeeper's
 * model is "size present ⇒ in stock", so a variant with stock_qty > 0 means
 * that size is available. products.stock_qty / is_in_stock are kept as a MIRROR
 * (sum of variant stock) so the storefront, cart and orders keep working while
 * we transition — recomputed only on explicit ERP edits and on (re)import, never
 * on a passive seed (which would wrongly zero out freshly-imported products).
 *
 * Every change writes a stock_movements row for a full audit trail.
 *
 * DESYNC GOTCHA: lib/products.ts (admin grid — CatalogGrid bulk actions
 * "В наявн." / "Немає", or an inline is_in_stock edit) writes products.is_in_stock
 * directly, bypassing the variant mirror above. The next stockImport.ts import
 * or ERP stock edit recomputes the mirror from product_variants and silently
 * overwrites that manual override. If a manually-toggled stock flag "reverts
 * itself" after an import, this is why — the fix is to edit variant stock
 * (ERP), not the products-table flag, for anything that should survive a
 * re-import.
 */

import type { PoolClient } from "pg";
import { pool, q, q1 } from "./pg";

export type Variant = {
  id: number;
  product_id: number;
  size: string;
  barcode: string;
  offer_code: string;          // mp-код оффера
  stock_qty: number;
  price: number | null;        // базова ціна (NULL ⇒ за товаром)
  sale_price: number | null;   // акційна ціна (NULL ⇒ немає)
  active: boolean;
  updated_at: string;
  updated_by: string;
};

const VARIANT_COLS = `id, product_id, size, barcode, offer_code, stock_qty,
  price::float AS price, sale_price::float AS sale_price, active, updated_at, updated_by`;

export type Movement = {
  id: number;
  product_id: number;
  size: string;
  type: string;
  delta: number;
  qty_after: number | null;
  note: string;
  author: string;
  created_at: string;
};

export type ErpProductRow = {
  id: string;
  name: string;
  brand: string;
  sku: string;             // Код товару (internal code)
  factory_article: string; // Заводський артикул (supplier article)
  category: string;
  color: string;
  season: string;
  status: string;          // draft | moderation | publish | inactive
  price: number;
  image_src: string;
  is_in_stock: boolean;
  stock_qty: number;       // mirror on products
  variant_count: number;   // size rows defined
  variant_units: number;   // summed variant stock (NULL-safe)
  created_at: string;
  updated_at: string;
};

/**
 * Product lifecycle (mirrors the Intertop marketplace partner workflow, in
 * Mania terms). Only `publish` is visible on the storefront (every storefront
 * query filters status='publish'), so draft / moderation / inactive auto-hide.
 *   draft      — Чернетка        (in progress, not submitted)
 *   moderation — На модерації     (submitted, awaiting review)
 *   publish    — Активний          (live on the storefront; "Публікувався: Так")
 *   inactive   — Деактивований     (withdrawn from sale, kept in catalog)
 */
export type ErpStatus = "draft" | "moderation" | "publish" | "inactive";
export const ERP_STATUS_LABEL: Record<ErpStatus, string> = {
  draft: "Чернетка",
  moderation: "На модерації",
  publish: "Активний",
  inactive: "Деактивований",
};
export const ERP_STATUSES: ErpStatus[] = ["draft", "moderation", "publish", "inactive"];

/** Set the lifecycle status on many products at once (bulk action bar). */
export async function bulkSetStatus(ids: (string | number)[], status: ErpStatus): Promise<number> {
  if (!ERP_STATUSES.includes(status)) throw new Error("Невідомий статус");
  const nums = ids.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return 0;
  const res = await q(
    "UPDATE products SET status = $2, updated_at = now() WHERE id = ANY($1)",
    [nums, status],
  );
  // pg returns rowCount on the QueryResult; q() returns rows, so re-count.
  return nums.length;
}

/** Per-status product counts for the ERP list filter chips. */
export async function erpStatusCounts(): Promise<Record<string, number>> {
  const rows = await q<{ status: string; n: string }>(
    "SELECT status, COUNT(*)::text AS n FROM products GROUP BY status",
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export const MOVEMENT_TYPES: Record<string, string> = {
  import: "Імпорт",
  receipt: "Прихід",
  sale: "Продаж",
  return: "Повернення",
  adjust: "Коригування",
  writeoff: "Списання",
};

/** Parse the size names a product already knows from its attributes JSON. */
function sizesFromAttributes(attributes: unknown): string[] {
  try {
    const arr = typeof attributes === "string" ? JSON.parse(attributes) : attributes;
    if (!Array.isArray(arr)) return [];
    const sizeAttr = arr.find(
      (a: { taxonomy?: string; name?: string }) =>
        a?.taxonomy === "pa_size" || /size|розмір|размер/i.test(a?.name ?? ""),
    ) ?? arr[0];
    const terms = sizeAttr?.terms ?? [];
    return terms
      .map((t: { name?: string }) => String(t?.name ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const ADMIN_ID_FLOOR = 900_000_000;

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-+|-+$/g, "");
}
function sizeAttributesJson(sizes: string[]): string {
  if (!sizes.length) return "[]";
  return JSON.stringify([{
    taxonomy: "pa_size", name: "Розмір",
    terms: sizes.map((s) => ({ name: s, slug: slugify(s) || s })),
  }]);
}

export type ErpProductInput = {
  name: string; brand?: string; category?: string; gender?: string;
  sku?: string; color?: string; composition?: string; season?: string;
  description?: string;
  regular_price: number; sale_price?: number | null; cost_price?: number | null;
  images?: string[];                       // local /uploads urls
  sizes?: { size: string; qty: number }[]; // creates variants with real stock
};

/**
 * Create a product the warehouse way (E-add): product row + per-size variants
 * WITH real quantities + manual cost + recomputed mirror + an opening 'receipt'
 * movement. One transaction. Manual ids live ≥ 900M so they never collide with
 * imported ids. This is the convenient "add a new unit" entry point for the ERP.
 */
export async function createErpProduct(input: ErpProductInput): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const idRow = await client.query<{ next: string }>(
      "SELECT (GREATEST(COALESCE(MAX(id),0), $1) + 1)::text AS next FROM products", [ADMIN_ID_FLOOR],
    );
    const id = Number(idRow.rows[0].next);
    const slug = String(id);
    const sale = input.sale_price && input.sale_price > 0 && input.sale_price < input.regular_price ? input.sale_price : null;
    const price = sale ?? input.regular_price;
    const category = input.category?.trim() || "Одяг";
    const catSlug = slugify(category) || "tovar";
    const sizes = (input.sizes ?? []).filter((s) => s.size.trim());
    const images = (input.images ?? []).filter(Boolean);
    const imagesJson = JSON.stringify(images.map((src) => ({ src, thumbnail: src, alt: "" })));

    await client.query(
      `INSERT INTO products
        (id, sku, name, slug, brand, category, category_slug, gender,
         price, regular_price, sale_price, is_in_stock, status,
         image_src, images, attributes, description, short_description,
         color, country, season, collection, composition,
         cost_price, cost_source, photos_migrated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,FALSE,'publish',
         $12,$13::jsonb,$14::jsonb,$15,'',
         $16,'',$17,'',$18,
         $19,$20,TRUE)`,
      [
        id, input.sku ?? "", input.name.trim(), slug, input.brand?.trim() || "Mania Group",
        category, catSlug, input.gender ?? "",
        price, input.regular_price, sale,
        images[0] ?? "", imagesJson, sizeAttributesJson(sizes.map((s) => s.size)),
        input.description ?? "",
        input.color ?? "", input.season ?? "", input.composition ?? "",
        input.cost_price && input.cost_price > 0 ? input.cost_price : null,
        input.cost_price && input.cost_price > 0 ? "manual" : "",
      ],
    );

    for (const s of sizes) {
      await client.query(
        `INSERT INTO product_variants (product_id, size, stock_qty, updated_by)
         VALUES ($1,$2,$3,'erp-new')
         ON CONFLICT (product_id, size) DO UPDATE SET stock_qty = EXCLUDED.stock_qty`,
        [id, s.size.trim(), Math.max(0, Math.round(s.qty) || 0)],
      );
    }

    const total = await recomputeProductStock(client, id);
    if (total > 0) {
      await client.query(
        `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
         VALUES ($1, NULL, '', 'receipt', $2, $2, 'Новий товар (ERP)', 'erp')`,
        [id, total],
      );
    }

    await client.query("COMMIT");
    return { id: String(id) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Recompute the products.stock_qty / is_in_stock mirror from its variants. */
async function recomputeProductStock(client: PoolClient, productId: number): Promise<number> {
  const r = await client.query<{ total: string }>(
    "SELECT COALESCE(SUM(stock_qty),0)::text AS total FROM product_variants WHERE product_id = $1 AND active",
    [productId],
  );
  const total = Number(r.rows[0]?.total ?? 0);
  await client.query(
    "UPDATE products SET stock_qty = $2, is_in_stock = ($2 > 0), updated_at = now() WHERE id = $1",
    [productId, total],
  );
  return total;
}

/** Sortable columns whitelist → SQL ORDER BY expression (prevents injection). */
const ERP_SORT_COLS: Record<string, string> = {
  name: "p.name",
  brand: "p.brand",
  price: "p.price",
  stock: "COALESCE(p.stock_qty,0)",
  status: "p.status",
  created: "p.created_at",
  updated: "p.updated_at",
  category: "p.category",
};

/** Product list for the ERP grid, with stock summary. */
export async function listErpProducts(opts: {
  q?: string; page?: number; perPage?: number; stock?: "in" | "out" | ""; status?: string;
  categories?: string[]; brands?: string[]; gender?: string; season?: string;
  sortBy?: string; sortDir?: "asc" | "desc";
}): Promise<{ products: ErpProductRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, opts.perPage ?? 50);
  // ERP sees the WHOLE assortment across every lifecycle status (unlike the
  // storefront, which only ever queries status='publish').
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q?.trim()) {
    // Extended search: name / brand / sku / factory_article, plus variant
    // barcode & offer_code via EXISTS (find a product by scanning a size).
    bind.push("%" + opts.q.trim() + "%");
    const i = bind.length;
    conds.push(`(p.name ILIKE $${i} OR p.brand ILIKE $${i} OR p.sku ILIKE $${i}
      OR p.factory_article ILIKE $${i}
      OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id
                 AND (v.barcode ILIKE $${i} OR v.offer_code ILIKE $${i})))`);
  }
  if (opts.status && (ERP_STATUSES as string[]).includes(opts.status)) {
    bind.push(opts.status);
    conds.push(`p.status = $${bind.length}`);
  }
  if (opts.stock === "in") conds.push("p.is_in_stock");
  if (opts.stock === "out") conds.push("NOT p.is_in_stock");
  // Multi-select chip filters (Intertop-style).
  const cats = (opts.categories ?? []).filter(Boolean);
  if (cats.length) { bind.push(cats); conds.push(`p.category = ANY($${bind.length})`); }
  const brands = (opts.brands ?? []).filter(Boolean);
  if (brands.length) { bind.push(brands); conds.push(`p.brand = ANY($${bind.length})`); }
  if (opts.gender?.trim()) { bind.push(opts.gender.trim()); conds.push(`p.gender = $${bind.length}`); }
  if (opts.season?.trim()) { bind.push(opts.season.trim()); conds.push(`p.season = $${bind.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  // ORDER BY: whitelisted column + direction, or default in-stock-first.
  const sortExpr = opts.sortBy && ERP_SORT_COLS[opts.sortBy];
  const dir = opts.sortDir === "asc" ? "ASC" : "DESC";
  const orderBy = sortExpr
    ? `${sortExpr} ${dir} NULLS LAST, p.id`
    : "p.is_in_stock DESC, p.brand, p.name";

  const countRow = await q1<{ n: string }>(`SELECT COUNT(*)::text AS n FROM products p ${where}`, bind);
  const rows = await q<ErpProductRow & { price: string; stock_qty: string; variant_count: string; variant_units: string }>(
    `SELECT p.id::text, p.name, p.brand, p.sku, p.factory_article, p.category,
            p.color, p.season, p.status, p.image_src, p.is_in_stock,
            p.price::float::text AS price,
            COALESCE(p.stock_qty,0)::text AS stock_qty,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
            (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_units
     FROM products p ${where}
     ORDER BY ${orderBy}
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    bind,
  );
  return {
    total: Number(countRow?.n ?? 0),
    products: rows.map((r) => ({
      id: r.id, name: r.name, brand: r.brand, sku: r.sku, factory_article: r.factory_article,
      category: r.category, color: r.color, season: r.season,
      status: r.status, image_src: r.image_src, is_in_stock: r.is_in_stock,
      price: Number(r.price), stock_qty: Number(r.stock_qty),
      created_at: r.created_at, updated_at: r.updated_at,
      variant_count: Number(r.variant_count), variant_units: Number(r.variant_units),
    })),
  };
}

/** Variants for a product; seed size rows from attributes on first access. */
export async function getOrSeedVariants(productId: number): Promise<Variant[]> {
  const existing = await q<Variant>(
    `SELECT ${VARIANT_COLS}
       FROM product_variants WHERE product_id = $1 ORDER BY id`,
    [productId],
  );
  if (existing.length > 0) return existing;

  const prod = await q1<{ attributes: unknown }>("SELECT attributes FROM products WHERE id = $1", [productId]);
  if (!prod) return [];
  const sizes = sizesFromAttributes(prod.attributes);
  // No declared sizes → single "one size" row so the product is still manageable.
  const seed = sizes.length ? sizes : ["One size"];
  // Seed at qty 0 WITHOUT touching the products mirror (preserve import stock).
  for (const s of seed) {
    await q(
      `INSERT INTO product_variants(product_id, size, stock_qty) VALUES ($1, $2, 0)
       ON CONFLICT (product_id, size) DO NOTHING`,
      [productId, s],
    );
  }
  return q<Variant>(
    `SELECT ${VARIANT_COLS}
       FROM product_variants WHERE product_id = $1 ORDER BY id`,
    [productId],
  );
}

export type ErpProductDetail = {
  id: string; name: string; brand: string; sku: string; factory_article: string;
  category: string; gender: string; status: string;
  price: string; regular_price: string; sale_price: string | null;
  cost_price: string | null;
  image_src: string; images: unknown; is_in_stock: boolean; stock_qty: string;
  color: string; composition: string; season: string; country: string;
  collection: string; description: string;
  created_at: string; updated_at: string;
};

export async function getProduct(productId: number) {
  return q1<ErpProductDetail>(
    `SELECT id::text, name, brand, sku, factory_article, category, gender, status,
            price::float::text AS price, regular_price::float::text AS regular_price,
            sale_price::float::text AS sale_price, cost_price::float::text AS cost_price,
            image_src, images, is_in_stock, COALESCE(stock_qty,0)::text AS stock_qty,
            color, composition, season, country, collection, description,
            meta_title, meta_description,
            created_at, updated_at
       FROM products WHERE id = $1`,
    [productId],
  );
}

/* ── Data quality: scan the catalogue for missing / inconsistent data ─────── */

export type DataQualityIssue = {
  key: string;
  label: string;
  severity: "error" | "warn" | "info";
  count: number;
  /** WHERE clause used by the drill-down list endpoint. */
  filter: string;
};

/**
 * One pass over the products table counting every common data gap. Each issue
 * carries the SQL predicate so the UI can drill into the exact rows and the
 * operator can jump straight to fixing them. Built for the XLS-imported catalog
 * where descriptive fields are routinely empty.
 */
export async function dataQualityReport(): Promise<{ total: number; issues: DataQualityIssue[] }> {
  const CHECKS: { key: string; label: string; severity: "error" | "warn" | "info"; filter: string }[] = [
    { key: "no_price",    label: "Без ціни (= 0)",            severity: "error", filter: "COALESCE(p.regular_price,0) <= 0" },
    { key: "no_brand",    label: "Без бренду",                severity: "error", filter: "p.brand = '' OR p.brand = 'Mania Group'" },
    { key: "no_category", label: "Без категорії",             severity: "warn",  filter: "p.category = ''" },
    { key: "no_photo",    label: "Без фото",                  severity: "warn",  filter: "p.image_src = '' AND (p.images = '[]'::jsonb OR p.images IS NULL)" },
    { key: "no_variants", label: "Без розмірів (варіантів)",  severity: "warn",  filter: "NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)" },
    { key: "no_cost",     label: "Без собівартості",          severity: "info",  filter: "p.cost_price IS NULL" },
    { key: "no_color",    label: "Без кольору",               severity: "info",  filter: "p.color = ''" },
    { key: "no_composition", label: "Без складу тканини",      severity: "info",  filter: "p.composition = ''" },
    { key: "no_seo",      label: "Без SEO (meta-title)",      severity: "info",  filter: "p.meta_title = ''" },
    { key: "no_factory_article", label: "Без заводського артикулу", severity: "info", filter: "p.factory_article = ''" },
    { key: "published_no_stock", label: "Активні, але немає в наявності", severity: "warn", filter: "p.status = 'publish' AND NOT p.is_in_stock" },
    { key: "stock_mismatch", label: "Залишок ≠ сумі варіантів", severity: "warn",
      filter: "COALESCE(p.stock_qty,0) <> COALESCE((SELECT SUM(stock_qty) FROM product_variants v WHERE v.product_id = p.id AND v.active),0)" },
  ];

  // Single grouped query: count every predicate in one table scan.
  const selectParts = CHECKS.map((c, i) => `COUNT(*) FILTER (WHERE ${c.filter})::int AS c${i}`).join(",\n");
  const row = await q1<Record<string, number | string>>(
    `SELECT COUNT(*)::int AS total, ${selectParts} FROM products p`,
  );
  const total = Number(row?.total ?? 0);
  const issues = CHECKS.map((c, i) => ({
    key: c.key, label: c.label, severity: c.severity,
    count: Number(row?.[`c${i}`] ?? 0),
    filter: c.filter,
  })).filter((iss) => iss.count > 0);

  return { total, issues };
}

/** Drill-down: the product rows matching one data-quality predicate. */
export async function dataQualityRows(issueKey: string, limit = 200): Promise<ErpProductRow[]> {
  const CHECKS: Record<string, string> = {
    no_price: "COALESCE(p.regular_price,0) <= 0",
    no_brand: "p.brand = '' OR p.brand = 'Mania Group'",
    no_category: "p.category = ''",
    no_photo: "p.image_src = '' AND (p.images = '[]'::jsonb OR p.images IS NULL)",
    no_variants: "NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)",
    no_cost: "p.cost_price IS NULL",
    no_color: "p.color = ''",
    no_composition: "p.composition = ''",
    no_seo: "p.meta_title = ''",
    no_factory_article: "p.factory_article = ''",
    published_no_stock: "p.status = 'publish' AND NOT p.is_in_stock",
    stock_mismatch: "COALESCE(p.stock_qty,0) <> COALESCE((SELECT SUM(stock_qty) FROM product_variants v WHERE v.product_id = p.id AND v.active),0)",
  };
  const filter = CHECKS[issueKey];
  if (!filter) return [];
  const rows = await q<ErpProductRow & { price: string; stock_qty: string; variant_count: string; variant_units: string }>(
    `SELECT p.id::text, p.name, p.brand, p.sku, p.factory_article, p.category,
            p.color, p.season, p.status, p.image_src, p.is_in_stock,
            p.price::float::text AS price, COALESCE(p.stock_qty,0)::text AS stock_qty,
            p.created_at, p.updated_at,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
            (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_units
     FROM products p WHERE ${filter}
     ORDER BY p.brand, p.name LIMIT ${Math.min(500, limit)}`,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, brand: r.brand, sku: r.sku, factory_article: r.factory_article,
    category: r.category, color: r.color, season: r.season, status: r.status,
    image_src: r.image_src, is_in_stock: r.is_in_stock,
    price: Number(r.price), stock_qty: Number(r.stock_qty),
    created_at: r.created_at, updated_at: r.updated_at,
    variant_count: Number(r.variant_count), variant_units: Number(r.variant_units),
  }));
}

/** Recompute the products mirror for EVERY product (fixes stock_mismatch en masse). */
export async function recomputeAllMirrors(): Promise<number> {
  const res = await pool.query(
    `UPDATE products p SET
        stock_qty = sub.total,
        is_in_stock = (sub.total > 0),
        updated_at = now()
     FROM (
       SELECT p2.id AS pid,
              COALESCE((SELECT SUM(stock_qty) FROM product_variants v WHERE v.product_id = p2.id AND v.active), 0) AS total
       FROM products p2
     ) sub
     WHERE p.id = sub.pid
       AND (p.stock_qty IS DISTINCT FROM sub.total OR p.is_in_stock <> (sub.total > 0))`,
  );
  return res.rowCount ?? 0;
}

/* ── Activity log: global audit feed across all products ──────────────────── */

export type ActivityRow = {
  id: number; product_id: string; product_name: string; brand: string;
  size: string; type: string; delta: number; qty_after: number | null;
  note: string; author: string; created_at: string;
};

export async function getActivityLog(opts: {
  type?: string; author?: string; page?: number; perPage?: number;
}): Promise<{ rows: ActivityRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(200, opts.perPage ?? 60);
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.type?.trim()) { bind.push(opts.type.trim()); conds.push(`sm.type = $${bind.length}`); }
  if (opts.author?.trim()) { bind.push("%" + opts.author.trim() + "%"); conds.push(`sm.author ILIKE $${bind.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  const countRow = await q1<{ n: string }>(`SELECT COUNT(*)::text AS n FROM stock_movements sm ${where}`, bind);
  const rows = await q<ActivityRow & { delta: string; qty_after: string | null }>(
    `SELECT sm.id, sm.product_id::text, COALESCE(p.name,'—') AS product_name, COALESCE(p.brand,'') AS brand,
            sm.size, sm.type, sm.delta, sm.qty_after, sm.note, sm.author, sm.created_at
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     ${where}
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    bind,
  );
  return {
    total: Number(countRow?.n ?? 0),
    rows: rows.map((r) => ({
      id: r.id, product_id: r.product_id, product_name: r.product_name, brand: r.brand,
      size: r.size, type: r.type, delta: Number(r.delta),
      qty_after: r.qty_after == null ? null : Number(r.qty_after),
      note: r.note, author: r.author, created_at: r.created_at,
    })),
  };
}

/**
 * Edit a product's own fields (the "Товар" tab). Recomputes the effective
 * `price` (sale ?? regular) and `is_in_stock` is left to the variant mirror.
 * Only whitelisted columns are touched; `status` drives the lifecycle.
 */
export type ErpProductPatch = Partial<{
  name: string; brand: string; category: string; gender: string;
  color: string; composition: string; season: string; country: string;
  collection: string; sku: string; factory_article: string; description: string;
  meta_title: string; meta_description: string;
  regular_price: number; sale_price: number | null; cost_price: number | null;
  status: ErpStatus;
}>;

export async function updateErpProduct(productId: number, patch: ErpProductPatch): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };

  const textCols: (keyof ErpProductPatch)[] = [
    "name", "brand", "category", "gender", "color", "composition",
    "season", "country", "collection", "sku", "factory_article", "description",
    "meta_title", "meta_description",
  ];
  for (const c of textCols) if (patch[c] !== undefined) add(c, String(patch[c] ?? "").trim());

  if (patch.status !== undefined) {
    if (!ERP_STATUSES.includes(patch.status)) throw new Error("Невідомий статус");
    add("status", patch.status);
  }
  if (patch.cost_price !== undefined) {
    const c = patch.cost_price && patch.cost_price > 0 ? patch.cost_price : null;
    add("cost_price", c);
    add("cost_source", c != null ? "manual" : "");
  }
  // Price: keep regular/sale/effective consistent. Recompute `price` whenever
  // either regular or sale changes.
  const wantPrice = patch.regular_price !== undefined || patch.sale_price !== undefined;
  if (patch.regular_price !== undefined) add("regular_price", patch.regular_price);
  if (patch.sale_price !== undefined) {
    const reg = patch.regular_price;
    const sale = patch.sale_price && patch.sale_price > 0 ? patch.sale_price : null;
    const validSale = sale != null && (reg === undefined || sale < reg) ? sale : (sale != null && reg === undefined ? sale : null);
    add("sale_price", validSale);
  }
  if (wantPrice) {
    // price = COALESCE(new sale, new regular, existing)
    const cur = await q1<{ regular_price: string; sale_price: string | null }>(
      "SELECT regular_price::float::text AS regular_price, sale_price::float::text AS sale_price FROM products WHERE id = $1",
      [productId],
    );
    const reg = patch.regular_price ?? Number(cur?.regular_price ?? 0);
    const saleRaw = patch.sale_price !== undefined
      ? (patch.sale_price && patch.sale_price > 0 ? patch.sale_price : null)
      : (cur?.sale_price != null ? Number(cur.sale_price) : null);
    const sale = saleRaw != null && saleRaw < reg ? saleRaw : null;
    add("price", sale ?? reg);
  }

  if (!sets.length) return;
  bind.push(productId);
  await q(`UPDATE products SET ${sets.join(", ")}, updated_at = now() WHERE id = $${bind.length}`, bind);
}

export async function getMovements(productId: number, limit = 50): Promise<Movement[]> {
  return q<Movement>(
    `SELECT id, product_id, size, type, delta, qty_after, note, author, created_at
       FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [productId, limit],
  );
}

/** Update a variant's meta (barcode / offer_code / price / sale_price / active) — no stock change. */
export async function updateVariantMeta(
  variantId: number,
  patch: { barcode?: string; offer_code?: string; price?: number | null; sale_price?: number | null; active?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };
  if (patch.barcode !== undefined) add("barcode", patch.barcode);
  if (patch.offer_code !== undefined) add("offer_code", patch.offer_code);
  if (patch.price !== undefined) add("price", patch.price);
  if (patch.sale_price !== undefined) add("sale_price", patch.sale_price);
  if (patch.active !== undefined) add("active", patch.active);
  if (!sets.length) return;
  bind.push(variantId);
  await q(`UPDATE product_variants SET ${sets.join(", ")}, updated_at = now() WHERE id = $${bind.length}`, bind);
  // Toggling `active` changes which variants count toward the product mirror.
  if (patch.active !== undefined) {
    await q(
      `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
         FROM (SELECT product_id, COALESCE(SUM(stock_qty),0) AS total
                 FROM product_variants WHERE active GROUP BY product_id) s
        WHERE p.id = s.product_id
          AND p.id = (SELECT product_id FROM product_variants WHERE id = $1)`,
      [variantId],
    );
    // Edge case: last active variant turned off ⇒ no row in the grouped set.
    await q(
      `UPDATE products SET stock_qty = 0, is_in_stock = FALSE, updated_at = now()
        WHERE id = (SELECT product_id FROM product_variants WHERE id = $1)
          AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_id = products.id AND active)`,
      [variantId],
    );
  }
}

/**
 * Apply a stock change to a variant: set an absolute qty OR a signed delta,
 * log the movement, and refresh the product mirror. Returns the new qty.
 */
export async function applyStockChange(input: {
  variantId: number;
  setQty?: number;      // absolute target
  delta?: number;       // signed change (ignored if setQty given)
  type?: string;        // receipt|sale|return|adjust|writeoff
  note?: string;
  author?: string;
}): Promise<{ qty: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ product_id: string; size: string; stock_qty: number }>(
      "SELECT product_id::text, size, stock_qty FROM product_variants WHERE id = $1 FOR UPDATE",
      [input.variantId],
    );
    if (!cur.rows.length) throw new Error("Variant not found");
    const { product_id, size } = cur.rows[0];
    const before = Number(cur.rows[0].stock_qty);
    const after = input.setQty != null ? Math.max(0, Math.round(input.setQty)) : Math.max(0, before + (input.delta ?? 0));
    const delta = after - before;

    await client.query(
      "UPDATE product_variants SET stock_qty = $2, updated_at = now(), updated_by = $3 WHERE id = $1",
      [input.variantId, after, input.author ?? "admin"],
    );
    if (delta !== 0 || input.type) {
      await client.query(
        `INSERT INTO stock_movements(product_id, variant_id, size, type, delta, qty_after, note, author)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [Number(product_id), input.variantId, size, input.type ?? "adjust", delta, after, input.note ?? "", input.author ?? "admin"],
      );
    }
    await recomputeProductStock(client, Number(product_id));
    await client.query("COMMIT");
    return { qty: after };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Add a new size row to a product. */
export async function addVariant(productId: number, size: string): Promise<Variant | null> {
  const s = size.trim();
  if (!s) return null;
  await q(
    `INSERT INTO product_variants(product_id, size, stock_qty) VALUES ($1,$2,0)
     ON CONFLICT (product_id, size) DO NOTHING`,
    [productId, s],
  );
  return q1<Variant>(
    `SELECT ${VARIANT_COLS} FROM product_variants WHERE product_id = $1 AND size = $2`,
    [productId, s],
  );
}

export async function deleteVariant(variantId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query<{ product_id: string }>(
      "DELETE FROM product_variants WHERE id = $1 RETURNING product_id::text", [variantId],
    );
    if (r.rows.length) await recomputeProductStock(client, Number(r.rows[0].product_id));
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Top-line ERP KPIs for the dashboard header. */
export async function erpOverview() {
  return q1<{ skus: string; in_stock: string; out_stock: string; units: string; variants: string }>(
    `SELECT COUNT(*)::text AS skus,
            COUNT(*) FILTER (WHERE is_in_stock)::text AS in_stock,
            COUNT(*) FILTER (WHERE NOT is_in_stock)::text AS out_stock,
            COALESCE(SUM(stock_qty),0)::text AS units,
            (SELECT COUNT(*) FROM product_variants)::text AS variants
       FROM products`,
  );
}
