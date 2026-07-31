/**
 * D4 — Прайс-листи постачальників: історія закупівельних цін.
 *
 * Окремої таблиці прайсів не заводимо — джерело правди вже є: проведені
 * прихідні документи (`receipts` status='posted' + `receipt_items`). Кожен
 * рядок приходу — це факт «цей постачальник продав нам цей товар за стільки
 * такого числа». Звідси і історія по товару, і порівняння постачальників.
 *
 * Ціни знеособлені від розміру: закупівельна ціна ходить по товару, а не по
 * розміру, тож рядки одного приходу агрегуються з вагою по кількості.
 *
 * Server-only.
 */

import { q } from "./pg";
import { ukrainianize } from "./uk";

export type PricePoint = {
  receiptId: number;
  docDate: string;
  supplier: string;
  supplierId: number | null;
  qty: number;
  unitCost: number;
};

export type ProductPriceHistory = {
  productId: number;
  name: string;
  brand: string;
  sku: string;
  image: string;
  /** Поточна роздрібна — щоб бачити маржу проти кожної закупки. */
  price: number;
  points: PricePoint[];
  minCost: number;
  maxCost: number;
  lastCost: number;
  /** Зміна останньої закупки проти попередньої, %. null — купували раз. */
  trendPct: number | null;
};

export type SupplierPriceRow = {
  supplierId: number | null;
  supplier: string;
  productId: number;
  name: string;
  sku: string;
  qty: number;
  avgCost: number;
  lastCost: number;
  lastDate: string;
  /** Наскільки цей постачальник дорожчий за найкращого по цьому товару, %. */
  vsBestPct: number | null;
};

const num = (v: unknown) => Number(v) || 0;

/** Історія закупівельних цін одного товару — від свіжих до старих. */
export async function getProductPriceHistory(productId: number): Promise<ProductPriceHistory | null> {
  const [p] = await q<{ id: string; name: string; brand: string; sku: string; image_src: string; price: string }>(
    `SELECT id::text AS id, name, brand, sku, image_src, COALESCE(price, 0)::float AS price
       FROM products WHERE id = $1`,
    [productId],
  );
  if (!p) return null;

  const rows = await q<{
    receipt_id: string; doc_date: string; supplier: string; supplier_id: string | null;
    qty: string; unit_cost: string;
  }>(
    `SELECT r.id::text          AS receipt_id,
            r.doc_date::text    AS doc_date,
            r.supplier,
            r.supplier_id::text AS supplier_id,
            SUM(ri.qty)                                                        AS qty,
            SUM(ri.unit_cost * ri.qty) / NULLIF(SUM(ri.qty), 0)                AS unit_cost
       FROM receipt_items ri
       JOIN receipts r ON r.id = ri.receipt_id
      WHERE ri.product_id = $1 AND r.status = 'posted'
      GROUP BY r.id, r.doc_date, r.supplier, r.supplier_id
      ORDER BY r.doc_date DESC, r.id DESC
      LIMIT 100`,
    [productId],
  );

  const points: PricePoint[] = rows.map((r) => ({
    receiptId: Number(r.receipt_id),
    docDate: r.doc_date,
    supplier: r.supplier || "—",
    supplierId: r.supplier_id ? Number(r.supplier_id) : null,
    qty: num(r.qty),
    unitCost: num(r.unit_cost),
  }));

  const costs = points.map((pt) => pt.unitCost).filter((c) => c > 0);
  const lastCost = points[0]?.unitCost ?? 0;
  const prevCost = points[1]?.unitCost ?? 0;

  return {
    productId: Number(p.id),
    name: ukrainianize(p.name),
    brand: p.brand,
    sku: p.sku,
    image: p.image_src,
    price: num(p.price),
    points,
    minCost: costs.length ? Math.min(...costs) : 0,
    maxCost: costs.length ? Math.max(...costs) : 0,
    lastCost,
    trendPct: prevCost > 0 ? ((lastCost - prevCost) / prevCost) * 100 : null,
  };
}

/**
 * Порівняння постачальників: по кожному товару, який брали більш ніж в одного,
 * показує середню й останню ціну кожного та відрив від найдешевшого.
 *
 * @param onlyMulti лише товари з ≥2 постачальниками (де є що порівнювати)
 */
export async function getSupplierPriceComparison(opts?: {
  supplierId?: number;
  search?: string;
  onlyMulti?: boolean;
  limit?: number;
}): Promise<SupplierPriceRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const params: unknown[] = [];
  const where: string[] = ["r.status = 'posted'"];

  if (opts?.supplierId) {
    params.push(opts.supplierId);
    where.push(`r.supplier_id = $${params.length}`);
  }
  if (opts?.search) {
    params.push(`%${opts.search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }

  const rows = await q<{
    supplier_id: string | null; supplier: string; product_id: string; name: string; sku: string;
    qty: string; avg_cost: string; last_cost: string; last_date: string; best_cost: string; suppliers: string;
  }>(
    `WITH per_supplier AS (
        SELECT ri.product_id,
               r.supplier_id,
               MAX(r.supplier)                                       AS supplier,
               SUM(ri.qty)                                           AS qty,
               SUM(ri.unit_cost * ri.qty) / NULLIF(SUM(ri.qty), 0)   AS avg_cost,
               MAX(r.doc_date)                                       AS last_date,
               (ARRAY_AGG(ri.unit_cost ORDER BY r.doc_date DESC, r.id DESC))[1] AS last_cost
          FROM receipt_items ri
          JOIN receipts r ON r.id = ri.receipt_id
          JOIN products p ON p.id = ri.product_id
         WHERE ${where.join(" AND ")}
         GROUP BY ri.product_id, r.supplier_id
     ), ranked AS (
        SELECT ps.*,
               MIN(ps.avg_cost) OVER (PARTITION BY ps.product_id) AS best_cost,
               COUNT(*)         OVER (PARTITION BY ps.product_id) AS suppliers
          FROM per_supplier ps
     )
     SELECT ranked.supplier_id::text AS supplier_id, ranked.supplier,
            ranked.product_id::text  AS product_id, p.name, p.sku,
            ranked.qty, ranked.avg_cost, ranked.last_cost,
            ranked.last_date::text   AS last_date,
            ranked.best_cost, ranked.suppliers
       FROM ranked
       JOIN products p ON p.id = ranked.product_id
      ${opts?.onlyMulti ? "WHERE ranked.suppliers > 1" : ""}
      ORDER BY ranked.product_id, ranked.avg_cost
      LIMIT ${limit}`,
    params,
  );

  return rows.map((r) => {
    const avg = num(r.avg_cost);
    const best = num(r.best_cost);
    return {
      supplierId: r.supplier_id ? Number(r.supplier_id) : null,
      supplier: r.supplier || "—",
      productId: Number(r.product_id),
      name: ukrainianize(r.name),
      sku: r.sku,
      qty: num(r.qty),
      avgCost: avg,
      lastCost: num(r.last_cost),
      lastDate: r.last_date,
      vsBestPct: best > 0 && avg > 0 ? ((avg - best) / best) * 100 : null,
    };
  });
}

/** Товари з найбільшим розкидом закупівельних цін — де торг дає найбільше. */
export async function getPriceSpread(limit = 30): Promise<
  { productId: number; name: string; sku: string; minCost: number; maxCost: number; spreadPct: number; receipts: number }[]
> {
  const rows = await q<{
    product_id: string; name: string; sku: string; min_cost: string; max_cost: string; receipts: string;
  }>(
    `SELECT ri.product_id::text AS product_id, p.name, p.sku,
            MIN(ri.unit_cost) AS min_cost,
            MAX(ri.unit_cost) AS max_cost,
            COUNT(DISTINCT r.id) AS receipts
       FROM receipt_items ri
       JOIN receipts r ON r.id = ri.receipt_id
       JOIN products p ON p.id = ri.product_id
      WHERE r.status = 'posted' AND ri.unit_cost > 0
      GROUP BY ri.product_id, p.name, p.sku
     HAVING COUNT(DISTINCT r.id) > 1 AND MIN(ri.unit_cost) > 0
      ORDER BY (MAX(ri.unit_cost) - MIN(ri.unit_cost)) / MIN(ri.unit_cost) DESC
      LIMIT $1`,
    [limit],
  );

  return rows.map((r) => {
    const min = num(r.min_cost);
    const max = num(r.max_cost);
    return {
      productId: Number(r.product_id),
      name: ukrainianize(r.name),
      sku: r.sku,
      minCost: min,
      maxCost: max,
      spreadPct: min > 0 ? ((max - min) / min) * 100 : 0,
      receipts: num(r.receipts),
    };
  });
}
