/**
 * Stocktaking (інвентаризація) — physical count documents (A2). Workflow:
 *   1. create a draft stocktake,
 *   2. add variants to count (search a product, or bulk by brand / in-stock),
 *      snapshotting the current stock_qty as `expected`,
 *   3. enter the physical `counted` per line — the UI shows variance,
 *   4. post: set each counted variant to its physical count, log an 'adjust'
 *      stock movement for the variance, recompute the products mirror.
 *
 * Closes the «звірка» loop surfaced on the ERP dashboard. Server-only.
 */

import { pool, q, q1 } from "./pg";

export type Stocktake = {
  id: number; note: string; scope: string;
  status: "draft" | "posted"; created_at: string; posted_at: string | null;
};
export type StocktakeItem = {
  id: number; product_id: number; variant_id: number;
  name: string; brand: string; size: string; expected: number; counted: number | null;
};

export async function listStocktakes(): Promise<(Stocktake & { items: number; counted: number; variance: number })[]> {
  return q(
    `SELECT s.id, s.note, s.scope, s.status, s.created_at, s.posted_at,
            COUNT(si.id)::int AS items,
            COUNT(si.counted)::int AS counted,
            COALESCE(SUM(CASE WHEN si.counted IS NOT NULL THEN si.counted - si.expected ELSE 0 END),0)::int AS variance
       FROM stocktakes s LEFT JOIN stocktake_items si ON si.stocktake_id = s.id
      GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`,
  );
}

export async function getStocktake(id: number): Promise<{ stocktake: Stocktake; items: StocktakeItem[] } | null> {
  const stocktake = await q1<Stocktake>(
    `SELECT id, note, scope, status, created_at, posted_at FROM stocktakes WHERE id = $1`, [id],
  );
  if (!stocktake) return null;
  const items = await q<StocktakeItem>(
    `SELECT id, product_id, variant_id, name, brand, size, expected, counted
       FROM stocktake_items WHERE stocktake_id = $1 ORDER BY brand, name, size, id`,
    [id],
  );
  return { stocktake, items };
}

export async function createStocktake(input: { note?: string; scope?: string }): Promise<number> {
  const row = await q1<{ id: number }>(
    `INSERT INTO stocktakes (note, scope) VALUES ($1, $2) RETURNING id`,
    [input.note ?? "", input.scope ?? ""],
  );
  return row!.id;
}

export async function deleteStocktake(id: number): Promise<void> {
  await q("DELETE FROM stocktakes WHERE id = $1 AND status = 'draft'", [id]);
}

/**
 * Add lines to a draft stocktake by source:
 *   { productId }   — all active variants of one product
 *   { brand }       — all active variants of a brand
 *   { allInStock }  — all active variants with stock_qty > 0 (capped)
 * Snapshots each variant's current stock_qty as `expected`. Idempotent via the
 * (stocktake_id, variant_id) unique constraint.
 */
export async function addStocktakeItems(
  id: number,
  src: { productId?: number; brand?: string; allInStock?: boolean },
): Promise<number> {
  const st = await q1<{ status: string }>("SELECT status FROM stocktakes WHERE id = $1", [id]);
  if (!st || st.status !== "draft") throw new Error("Інвентаризацію вже проведено");

  const conds = ["v.active"];
  const bind: unknown[] = [id];
  if (src.productId) { bind.push(src.productId); conds.push(`v.product_id = $${bind.length}`); }
  else if (src.brand) { bind.push(src.brand); conds.push(`p.brand = $${bind.length}`); }
  else if (src.allInStock) { conds.push("v.stock_qty > 0"); }
  else return 0;

  const cap = src.productId ? 500 : 2000;
  const res = await q<{ id: string }>(
    `INSERT INTO stocktake_items (stocktake_id, product_id, variant_id, name, brand, size, expected)
       SELECT $1, v.product_id, v.id, p.name, p.brand, v.size, v.stock_qty
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE ${conds.join(" AND ")}
        ORDER BY p.brand, p.name, v.size
        LIMIT ${cap}
     ON CONFLICT (stocktake_id, variant_id) DO NOTHING
     RETURNING id`,
    bind,
  );
  return res.length;
}

export async function setStocktakeCount(itemId: number, counted: number | null): Promise<void> {
  await q(
    `UPDATE stocktake_items si SET counted = $2
       FROM stocktakes s
      WHERE si.id = $1 AND si.stocktake_id = s.id AND s.status = 'draft'`,
    [itemId, counted],
  );
}

export async function deleteStocktakeItem(itemId: number): Promise<void> {
  await q(
    `DELETE FROM stocktake_items si USING stocktakes s
      WHERE si.id = $1 AND si.stocktake_id = s.id AND s.status = 'draft'`,
    [itemId],
  );
}

/**
 * Post a draft stocktake. For every counted line, set the variant to the physical
 * count, log an 'adjust' movement for the variance (counted − current), and
 * recompute each affected product's mirror. Uncounted lines are ignored.
 */
export async function postStocktake(id: number): Promise<{ ok: true; adjusted: number; surplus: number; shortage: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const st = await client.query<{ status: string }>("SELECT status FROM stocktakes WHERE id = $1 FOR UPDATE", [id]);
    if (!st.rows.length) throw new Error("Інвентаризацію не знайдено");
    if (st.rows[0].status !== "draft") throw new Error("Інвентаризацію вже проведено");

    const items = (await client.query<{ product_id: string; variant_id: string; size: string; counted: number }>(
      `SELECT product_id::text, variant_id::text, size, counted
         FROM stocktake_items WHERE stocktake_id = $1 AND counted IS NOT NULL`,
      [id],
    )).rows;

    let adjusted = 0, surplus = 0, shortage = 0;
    const products = new Set<number>();

    for (const it of items) {
      const vid = Number(it.variant_id);
      const cur = await client.query<{ stock_qty: number }>(
        "SELECT stock_qty FROM product_variants WHERE id = $1 FOR UPDATE", [vid],
      );
      if (!cur.rows.length) continue;
      const current = cur.rows[0].stock_qty;
      const delta = it.counted - current;
      products.add(Number(it.product_id));
      if (delta === 0) continue;

      await client.query(
        "UPDATE product_variants SET stock_qty = $2, active = TRUE, updated_at = now(), updated_by = 'stocktake' WHERE id = $1",
        [vid, it.counted],
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
         VALUES ($1, $2, $3, 'adjust', $4, $5, $6, 'stocktake')`,
        [Number(it.product_id), vid, it.size, delta, it.counted, `Інвентаризація #${id}`],
      );
      adjusted++;
      if (delta > 0) surplus += delta; else shortage += -delta;
    }

    // Recompute mirror for affected products.
    for (const pid of products) {
      await client.query(
        `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
           FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id = $1 AND active) s
          WHERE p.id = $1`,
        [pid],
      );
    }

    await client.query("UPDATE stocktakes SET status = 'posted', posted_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");
    return { ok: true, adjusted, surplus, shortage };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
