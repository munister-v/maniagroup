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
 */

import type { PoolClient } from "pg";
import { pool, q, q1 } from "./pg";

export type Variant = {
  id: number;
  product_id: number;
  size: string;
  barcode: string;
  stock_qty: number;
  price: number | null;
  active: boolean;
  updated_at: string;
  updated_by: string;
};

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
  sku: string;
  category: string;
  price: number;
  image_src: string;
  is_in_stock: boolean;
  stock_qty: number;     // mirror on products
  variant_count: number; // size rows defined
  variant_units: number; // summed variant stock (NULL-safe)
};

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

/** Product list for the ERP grid, with stock summary. */
export async function listErpProducts(opts: {
  q?: string; page?: number; perPage?: number; stock?: "in" | "out" | "";
}): Promise<{ products: ErpProductRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, opts.perPage ?? 50);
  const conds = ["p.status = 'publish'"];
  const bind: unknown[] = [];
  if (opts.q?.trim()) {
    bind.push("%" + opts.q.trim() + "%");
    conds.push(`(p.name ILIKE $${bind.length} OR p.brand ILIKE $${bind.length} OR p.sku ILIKE $${bind.length})`);
  }
  if (opts.stock === "in") conds.push("p.is_in_stock");
  if (opts.stock === "out") conds.push("NOT p.is_in_stock");
  const where = conds.join(" AND ");

  const countRow = await q1<{ n: string }>(`SELECT COUNT(*)::text AS n FROM products p WHERE ${where}`, bind);
  const rows = await q<ErpProductRow & { price: string; stock_qty: string; variant_count: string; variant_units: string }>(
    `SELECT p.id::text, p.name, p.brand, p.sku, p.category, p.image_src, p.is_in_stock,
            p.price::float::text AS price,
            COALESCE(p.stock_qty,0)::text AS stock_qty,
            (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_count,
            (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants v WHERE v.product_id = p.id)::text AS variant_units
     FROM products p WHERE ${where}
     ORDER BY p.is_in_stock DESC, p.brand, p.name
     LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    bind,
  );
  return {
    total: Number(countRow?.n ?? 0),
    products: rows.map((r) => ({
      id: r.id, name: r.name, brand: r.brand, sku: r.sku, category: r.category,
      image_src: r.image_src, is_in_stock: r.is_in_stock,
      price: Number(r.price), stock_qty: Number(r.stock_qty),
      variant_count: Number(r.variant_count), variant_units: Number(r.variant_units),
    })),
  };
}

/** Variants for a product; seed size rows from attributes on first access. */
export async function getOrSeedVariants(productId: number): Promise<Variant[]> {
  const existing = await q<Variant>(
    `SELECT id, product_id, size, barcode, stock_qty, price::float AS price, active,
            updated_at, updated_by
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
    `SELECT id, product_id, size, barcode, stock_qty, price::float AS price, active,
            updated_at, updated_by
       FROM product_variants WHERE product_id = $1 ORDER BY id`,
    [productId],
  );
}

export async function getProduct(productId: number) {
  return q1<{
    id: string; name: string; brand: string; sku: string; category: string;
    price: string; regular_price: string; image_src: string; images: unknown;
    is_in_stock: boolean; stock_qty: string; color: string; composition: string;
  }>(
    `SELECT id::text, name, brand, sku, category,
            price::float::text AS price, regular_price::float::text AS regular_price,
            image_src, images, is_in_stock, COALESCE(stock_qty,0)::text AS stock_qty,
            color, composition
       FROM products WHERE id = $1`,
    [productId],
  );
}

export async function getMovements(productId: number, limit = 50): Promise<Movement[]> {
  return q<Movement>(
    `SELECT id, product_id, size, type, delta, qty_after, note, author, created_at
       FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [productId, limit],
  );
}

/** Update a variant's meta (barcode / price / active) — no stock change. */
export async function updateVariantMeta(
  variantId: number,
  patch: { barcode?: string; price?: number | null; active?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };
  if (patch.barcode !== undefined) add("barcode", patch.barcode);
  if (patch.price !== undefined) add("price", patch.price);
  if (patch.active !== undefined) add("active", patch.active);
  if (!sets.length) return;
  bind.push(variantId);
  await q(`UPDATE product_variants SET ${sets.join(", ")}, updated_at = now() WHERE id = $${bind.length}`, bind);
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
    `SELECT id, product_id, size, barcode, stock_qty, price::float AS price, active, updated_at, updated_by
       FROM product_variants WHERE product_id = $1 AND size = $2`,
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
       FROM products WHERE status = 'publish'`,
  );
}
