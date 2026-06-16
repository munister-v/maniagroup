/**
 * Receiving (приход) — supplier intake documents that add stock AND set a real
 * purchase cost. Posting a receipt:
 *   1. adds units to each variant (logged as 'receipt' stock movements),
 *   2. recomputes the products stock mirror,
 *   3. updates the product's WEIGHTED-AVERAGE cost_price (cost_source='receipt').
 *
 * Because the finance engine prefers products.cost_price over the derived markup
 * (see finance.ts), posting receipts feeds real margins everywhere — closing the
 * "exports carry no cost" gap. Server-only.
 */

import { pool, q, q1 } from "./pg";

export type Receipt = {
  id: number; supplier: string; supplier_id: number | null; doc_date: string; note: string;
  status: "draft" | "posted"; created_at: string; posted_at: string | null;
};
export type ReceiptItem = {
  id: number; receipt_id: number; product_id: number; variant_id: number | null;
  size: string; name: string; qty: number; unit_cost: number;
};

export async function listReceipts(): Promise<(Receipt & { items: number; units: number; total: number })[]> {
  return q(
    `SELECT r.id, r.supplier, r.supplier_id, r.doc_date::text AS doc_date, r.note, r.status,
            r.created_at, r.posted_at,
            COUNT(ri.id)::int AS items,
            COALESCE(SUM(ri.qty),0)::int AS units,
            COALESCE(SUM(ri.qty * ri.unit_cost),0)::float AS total
       FROM receipts r LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
      GROUP BY r.id ORDER BY r.doc_date DESC, r.id DESC`,
  );
}

export async function getReceipt(id: number): Promise<{ receipt: Receipt; items: ReceiptItem[] } | null> {
  const receipt = await q1<Receipt>(
    `SELECT id, supplier, supplier_id, doc_date::text AS doc_date, note, status, created_at, posted_at
       FROM receipts WHERE id = $1`,
    [id],
  );
  if (!receipt) return null;
  const items = await q<ReceiptItem>(
    `SELECT id, receipt_id, product_id, variant_id, size, name, qty, unit_cost::float AS unit_cost
       FROM receipt_items WHERE receipt_id = $1 ORDER BY id`,
    [id],
  );
  return { receipt, items };
}

export async function createReceipt(input: { supplier?: string; supplier_id?: number | null; doc_date?: string; note?: string }): Promise<number> {
  // If a supplier_id is given, snapshot its current name onto the receipt.
  let supplier = input.supplier ?? "";
  if (input.supplier_id) {
    const s = await q1<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [input.supplier_id]);
    if (s) supplier = s.name;
  }
  const row = await q1<{ id: number }>(
    `INSERT INTO receipts (supplier, supplier_id, doc_date, note) VALUES ($1, $2, COALESCE($3, current_date), $4) RETURNING id`,
    [supplier, input.supplier_id ?? null, input.doc_date || null, input.note ?? ""],
  );
  return row!.id;
}

export async function updateReceipt(id: number, patch: { supplier?: string; supplier_id?: number | null; doc_date?: string; note?: string }): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (c: string, v: unknown) => { bind.push(v); sets.push(`${c} = $${bind.length}`); };
  if (patch.supplier_id !== undefined) {
    add("supplier_id", patch.supplier_id);
    if (patch.supplier_id) {
      const s = await q1<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [patch.supplier_id]);
      if (s) add("supplier", s.name);
    }
  }
  if (patch.supplier !== undefined && patch.supplier_id === undefined) add("supplier", patch.supplier);
  if (patch.doc_date) add("doc_date", patch.doc_date);
  if (patch.note !== undefined) add("note", patch.note);
  if (!sets.length) return;
  bind.push(id);
  await q(`UPDATE receipts SET ${sets.join(", ")} WHERE id = $${bind.length} AND status = 'draft'`, bind);
}

/** Add a line by variant. Resolves product/size/name from the variant. */
export async function addReceiptItem(
  receiptId: number,
  input: { variantId: number; qty: number; unitCost: number },
): Promise<ReceiptItem | null> {
  const v = await q1<{ product_id: string; size: string; name: string }>(
    `SELECT pv.product_id::text, pv.size, p.name
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1`,
    [input.variantId],
  );
  if (!v) throw new Error("Розмір не знайдено");
  const row = await q1<ReceiptItem>(
    `INSERT INTO receipt_items (receipt_id, product_id, variant_id, size, name, qty, unit_cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, receipt_id, product_id, variant_id, size, name, qty, unit_cost::float AS unit_cost`,
    [receiptId, Number(v.product_id), input.variantId, v.size, v.name, Math.max(0, Math.round(input.qty)), Math.max(0, input.unitCost)],
  );
  return row;
}

export async function updateReceiptItem(itemId: number, patch: { qty?: number; unitCost?: number }): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (c: string, v: unknown) => { bind.push(v); sets.push(`${c} = $${bind.length}`); };
  if (patch.qty !== undefined) add("qty", Math.max(0, Math.round(patch.qty)));
  if (patch.unitCost !== undefined) add("unit_cost", Math.max(0, patch.unitCost));
  if (!sets.length) return;
  bind.push(itemId);
  await q(`UPDATE receipt_items SET ${sets.join(", ")} WHERE id = $${bind.length}`, bind);
}

export async function deleteReceiptItem(itemId: number): Promise<void> {
  await q("DELETE FROM receipt_items WHERE id = $1", [itemId]);
}

export async function deleteReceipt(id: number): Promise<void> {
  await q("DELETE FROM receipts WHERE id = $1 AND status = 'draft'", [id]);
}

/**
 * Post a draft receipt: add stock to each variant, log movements, recompute the
 * products mirror, and update each product's weighted-average cost. Idempotent
 * guard: only a 'draft' can be posted.
 */
export async function postReceipt(id: number): Promise<{ ok: true }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rcp = await client.query<{ status: string }>("SELECT status FROM receipts WHERE id = $1 FOR UPDATE", [id]);
    if (!rcp.rows.length) throw new Error("Прихід не знайдено");
    if (rcp.rows[0].status !== "draft") throw new Error("Прихід вже проведено");

    const items = (await client.query<{ id: string; product_id: string; variant_id: string | null; size: string; qty: number; unit_cost: string }>(
      `SELECT id::text, product_id::text, variant_id::text, size, qty, unit_cost::float::text AS unit_cost
         FROM receipt_items WHERE receipt_id = $1`,
      [id],
    )).rows;
    if (!items.length) throw new Error("Додайте хоча б одну позицію");

    // Group lines by product for the weighted-average cost computation.
    const byProduct = new Map<number, { recvQty: number; recvCostSum: number; lines: typeof items }>();
    for (const it of items) {
      const pid = Number(it.product_id);
      const g = byProduct.get(pid) ?? { recvQty: 0, recvCostSum: 0, lines: [] };
      g.recvQty += it.qty;
      g.recvCostSum += it.qty * Number(it.unit_cost);
      g.lines.push(it);
      byProduct.set(pid, g);
    }

    for (const [pid, g] of byProduct) {
      // Stock + cost basis BEFORE this posting.
      const prevStockRow = await client.query<{ total: string }>(
        "SELECT COALESCE(SUM(stock_qty),0)::text AS total FROM product_variants WHERE product_id = $1 AND active", [pid],
      );
      const prevStock = Number(prevStockRow.rows[0]?.total ?? 0);
      const costRow = await client.query<{ cost_price: string | null; cost_source: string }>(
        "SELECT cost_price::float::text AS cost_price, cost_source FROM products WHERE id = $1", [pid],
      );
      const prevCost = costRow.rows[0]?.cost_price != null && ["manual", "receipt"].includes(costRow.rows[0].cost_source)
        ? Number(costRow.rows[0].cost_price) : null;

      // Add stock per line + log movement.
      for (const ln of g.lines) {
        if (!ln.variant_id) continue;
        const upd = await client.query<{ stock_qty: number }>(
          "UPDATE product_variants SET stock_qty = stock_qty + $2, updated_at = now(), updated_by = 'receipt' WHERE id = $1 RETURNING stock_qty",
          [Number(ln.variant_id), ln.qty],
        );
        const after = upd.rows[0]?.stock_qty ?? null;
        await client.query(
          `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
           VALUES ($1,$2,$3,'receipt',$4,$5,$6,'receipt')`,
          [pid, Number(ln.variant_id), ln.size, ln.qty, after, `Прихід #${id}`],
        );
      }

      // Recompute mirror.
      await client.query(
        `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
           FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id = $1 AND active) s
          WHERE p.id = $1`,
        [pid],
      );

      // Weighted-average cost.
      const recvAvg = g.recvQty > 0 ? g.recvCostSum / g.recvQty : 0;
      const newCost = prevCost != null && prevStock > 0
        ? (prevStock * prevCost + g.recvCostSum) / (prevStock + g.recvQty)
        : recvAvg;
      if (newCost > 0) {
        await client.query(
          "UPDATE products SET cost_price = $2, cost_source = 'receipt', updated_at = now() WHERE id = $1",
          [pid, Math.round(newCost * 100) / 100],
        );
      }
    }

    await client.query("UPDATE receipts SET status = 'posted', posted_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
