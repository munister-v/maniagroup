/**
 * Purchasing (закупівлі) — purchase orders to suppliers + replenishment.
 *
 * A purchase order (PO) is the PLAN: what we intend to buy, from whom, at what
 * expected cost. Receiving a PO produces the FACT — a posted receipt via the
 * proven receiving engine (receiving.ts), which adds stock, logs movements and
 * updates the weighted-average cost. So purchasing layers cleanly on top of the
 * existing склад + собівартість machinery without duplicating it.
 *
 *   draft  → editable, add/remove lines, pick supplier + expected date
 *   sent   → locked (order placed with supplier)
 *   received → a receipt was created & posted from the lines (receipt_id set)
 *   cancelled → closed without receiving
 *
 * Replenishment scans variants that are low/out of stock, joins sales velocity
 * (last 30d sale movements) and proposes a reorder quantity — the seed for a PO.
 *
 * Server-only.
 */

import { pool, q, q1 } from "./pg";
import { createReceipt, addReceiptItem, postReceipt } from "./receiving";
import { getStoreSettings } from "./settings";

export type PoStatus = "draft" | "sent" | "received" | "cancelled";

export type PurchaseOrder = {
  id: number; supplier_id: number | null; supplier: string; status: PoStatus;
  note: string; expected_at: string | null; receipt_id: number | null;
  created_at: string; sent_at: string | null; received_at: string | null;
};
export type PoItem = {
  id: number; po_id: number; product_id: number; variant_id: number | null;
  size: string; name: string; brand: string; qty: number; unit_cost: number;
};
export type PoListRow = PurchaseOrder & { items: number; units: number; total: number };

/* ── list / read ───────────────────────────────────────────────────────────── */

export async function listPurchaseOrders(status?: PoStatus): Promise<PoListRow[]> {
  const where = status ? "WHERE po.status = $1" : "";
  const args = status ? [status] : [];
  return q<PoListRow>(
    `SELECT po.id, po.supplier_id, po.supplier, po.status, po.note,
            po.expected_at::text AS expected_at, po.receipt_id,
            po.created_at, po.sent_at, po.received_at,
            COUNT(i.id)::int                        AS items,
            COALESCE(SUM(i.qty),0)::int             AS units,
            COALESCE(SUM(i.qty * i.unit_cost),0)::float AS total
       FROM purchase_orders po
       LEFT JOIN purchase_order_items i ON i.po_id = po.id
       ${where}
      GROUP BY po.id
      ORDER BY po.created_at DESC, po.id DESC`,
    args,
  );
}

export async function getPurchaseOrder(id: number): Promise<{ po: PurchaseOrder; items: PoItem[] } | null> {
  const po = await q1<PurchaseOrder>(
    `SELECT id, supplier_id, supplier, status, note, expected_at::text AS expected_at,
            receipt_id, created_at, sent_at, received_at
       FROM purchase_orders WHERE id = $1`,
    [id],
  );
  if (!po) return null;
  const items = await q<PoItem>(
    `SELECT id, po_id, product_id, variant_id, size, name, brand, qty, unit_cost::float AS unit_cost
       FROM purchase_order_items WHERE po_id = $1 ORDER BY id`,
    [id],
  );
  return { po, items };
}

/* ── create / edit (draft only) ──────────────────────────────────────────── */

export async function createPurchaseOrder(input: { supplier_id?: number | null; supplier?: string; expected_at?: string; note?: string }): Promise<number> {
  let supplier = input.supplier ?? "";
  if (input.supplier_id) {
    const s = await q1<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [input.supplier_id]);
    if (s) supplier = s.name;
  }
  const row = await q1<{ id: number }>(
    `INSERT INTO purchase_orders (supplier_id, supplier, expected_at, note)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.supplier_id ?? null, supplier, input.expected_at || null, input.note ?? ""],
  );
  return row!.id;
}

export async function updatePurchaseOrder(id: number, patch: { supplier_id?: number | null; expected_at?: string; note?: string }): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (c: string, v: unknown) => { bind.push(v); sets.push(`${c} = $${bind.length}`); };
  if (patch.supplier_id !== undefined) {
    add("supplier_id", patch.supplier_id);
    if (patch.supplier_id) {
      const s = await q1<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [patch.supplier_id]);
      add("supplier", s?.name ?? "");
    } else {
      add("supplier", "");
    }
  }
  if (patch.expected_at !== undefined) add("expected_at", patch.expected_at || null);
  if (patch.note !== undefined) add("note", patch.note);
  if (!sets.length) return;
  bind.push(id);
  await q(`UPDATE purchase_orders SET ${sets.join(", ")} WHERE id = $${bind.length} AND status = 'draft'`, bind);
}

/** Add a line by variant (resolves product/size/name/brand). Draft only. */
export async function addPoItem(poId: number, input: { variantId: number; qty: number; unitCost: number }): Promise<PoItem | null> {
  const po = await q1<{ status: string }>("SELECT status FROM purchase_orders WHERE id = $1", [poId]);
  if (!po || po.status !== "draft") throw new Error("Можна редагувати лише чернетку");
  const v = await q1<{ product_id: string; size: string; name: string; brand: string }>(
    `SELECT pv.product_id::text, pv.size, p.name, p.brand
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1`,
    [input.variantId],
  );
  if (!v) throw new Error("Розмір не знайдено");
  return q1<PoItem>(
    `INSERT INTO purchase_order_items (po_id, product_id, variant_id, size, name, brand, qty, unit_cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, po_id, product_id, variant_id, size, name, brand, qty, unit_cost::float AS unit_cost`,
    [poId, Number(v.product_id), input.variantId, v.size, v.name, v.brand,
     Math.max(0, Math.round(input.qty)), Math.max(0, input.unitCost)],
  );
}

export async function updatePoItem(itemId: number, patch: { qty?: number; unitCost?: number }): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (c: string, v: unknown) => { bind.push(v); sets.push(`${c} = $${bind.length}`); };
  if (patch.qty !== undefined) add("qty", Math.max(0, Math.round(patch.qty)));
  if (patch.unitCost !== undefined) add("unit_cost", Math.max(0, patch.unitCost));
  if (!sets.length) return;
  bind.push(itemId);
  await q(`UPDATE purchase_order_items SET ${sets.join(", ")} WHERE id = $${bind.length}`, bind);
}

export async function deletePoItem(itemId: number): Promise<void> {
  await q("DELETE FROM purchase_order_items WHERE id = $1", [itemId]);
}

export async function deletePurchaseOrder(id: number): Promise<void> {
  // Only draft / cancelled POs can be hard-deleted (received ones keep history).
  await q("DELETE FROM purchase_orders WHERE id = $1 AND status IN ('draft','cancelled')", [id]);
}

/* ── lifecycle ──────────────────────────────────────────────────────────────── */

export async function sendPurchaseOrder(id: number): Promise<void> {
  const po = await q1<{ status: string; items: string }>(
    `SELECT po.status, COUNT(i.id)::text AS items
       FROM purchase_orders po LEFT JOIN purchase_order_items i ON i.po_id = po.id
      WHERE po.id = $1 GROUP BY po.status`, [id],
  );
  if (!po) throw new Error("Замовлення не знайдено");
  if (po.status !== "draft") throw new Error("Лише чернетку можна відправити");
  if (Number(po.items) === 0) throw new Error("Додайте хоча б одну позицію");
  await q("UPDATE purchase_orders SET status = 'sent', sent_at = now() WHERE id = $1", [id]);
}

export async function cancelPurchaseOrder(id: number): Promise<void> {
  await q("UPDATE purchase_orders SET status = 'cancelled' WHERE id = $1 AND status IN ('draft','sent')", [id]);
}

/**
 * Receive a PO: create a receipt from its lines and post it (stock + cost),
 * then mark the PO received and link the receipt. The receipt is the source of
 * truth for the actual intake; the PO records the intent + expected costs.
 * A PO must be 'sent' (or 'draft') and have lines. Idempotent: a received PO
 * can't be received twice.
 */
export async function receivePurchaseOrder(id: number, opts?: { doc_date?: string }): Promise<{ receiptId: number }> {
  const data = await getPurchaseOrder(id);
  if (!data) throw new Error("Замовлення не знайдено");
  if (data.po.status === "received") throw new Error("Замовлення вже отримано");
  if (data.po.status === "cancelled") throw new Error("Замовлення скасовано");
  const lines = data.items.filter((i) => i.variant_id && i.qty > 0);
  if (!lines.length) throw new Error("Немає позицій для отримання");

  // Build a receipt that mirrors the PO, then post it via the receiving engine.
  const receiptId = await createReceipt({
    supplier_id: data.po.supplier_id,
    supplier: data.po.supplier,
    doc_date: opts?.doc_date,
    note: `Отримання замовлення постачальнику #${id}`,
  });
  for (const ln of lines) {
    await addReceiptItem(receiptId, { variantId: ln.variant_id!, qty: ln.qty, unitCost: ln.unit_cost });
  }
  await postReceipt(receiptId);

  await q(
    "UPDATE purchase_orders SET status = 'received', received_at = now(), receipt_id = $2 WHERE id = $1",
    [id, receiptId],
  );
  return { receiptId };
}

/**
 * Seed a draft PO from a set of variant lines (used by replenishment "create PO
 * from selected"). Each line: variantId + qty (+ optional unitCost). Returns the
 * new PO id.
 */
export async function createPurchaseOrderFromLines(
  input: { supplier_id?: number | null; expected_at?: string; note?: string; lines: { variantId: number; qty: number; unitCost?: number }[] },
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let supplier = "";
    if (input.supplier_id) {
      const s = await client.query<{ name: string }>("SELECT name FROM suppliers WHERE id = $1", [input.supplier_id]);
      supplier = s.rows[0]?.name ?? "";
    }
    const poRow = await client.query<{ id: number }>(
      `INSERT INTO purchase_orders (supplier_id, supplier, expected_at, note)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [input.supplier_id ?? null, supplier, input.expected_at || null, input.note ?? "Поповнення складу"],
    );
    const poId = poRow.rows[0].id;
    for (const ln of input.lines) {
      if (!ln.variantId || ln.qty <= 0) continue;
      const v = await client.query<{ product_id: string; size: string; name: string; brand: string; cost: string | null }>(
        `SELECT pv.product_id::text, pv.size, p.name, p.brand, p.cost_price::float::text AS cost
           FROM product_variants pv JOIN products p ON p.id = pv.product_id
          WHERE pv.id = $1`, [ln.variantId],
      );
      if (!v.rows.length) continue;
      const row = v.rows[0];
      const unitCost = ln.unitCost != null ? Math.max(0, ln.unitCost) : Math.max(0, Number(row.cost ?? 0));
      await client.query(
        `INSERT INTO purchase_order_items (po_id, product_id, variant_id, size, name, brand, qty, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [poId, Number(row.product_id), ln.variantId, row.size, row.name, row.brand, Math.max(1, Math.round(ln.qty)), unitCost],
      );
    }
    await client.query("COMMIT");
    return poId;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* ── replenishment (поповнення) ──────────────────────────────────────────── */

export type ReplenishRow = {
  variant_id: number; product_id: number; name: string; brand: string; size: string;
  stock_qty: number; sold_30d: number; suggested: number; cost: number; retail: number;
};

/**
 * Variants at or below the low-stock threshold, enriched with 30-day sales
 * velocity and a suggested reorder qty. Suggested = cover the threshold twice,
 * but never less than what sold in the last 30 days (so fast movers reorder
 * more). Only published products; sorted most-urgent (lowest stock, then best
 * sellers) first.
 */
export async function getReplenishment(opts?: { threshold?: number; brand?: string; limit?: number }): Promise<ReplenishRow[]> {
  const settings = await getStoreSettings();
  const threshold = Math.max(0, opts?.threshold ?? (Number(settings.low_stock_threshold) || 3));
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 200));
  const brandFilter = opts?.brand ? "AND p.brand = $3" : "";
  const args: unknown[] = [threshold, limit];
  if (opts?.brand) args.push(opts.brand);

  const rows = await q<{
    variant_id: string; product_id: string; name: string; brand: string; size: string;
    stock_qty: number; sold_30d: string; cost: string | null; retail: string | null;
  }>(
    `SELECT v.id::text AS variant_id, p.id::text AS product_id, p.name, p.brand, v.size,
            v.stock_qty,
            COALESCE((
              SELECT SUM(-m.delta) FROM stock_movements m
               WHERE m.variant_id = v.id AND m.type = 'sale'
                 AND m.created_at >= now() - interval '30 days'
            ), 0)::text AS sold_30d,
            p.cost_price::float::text AS cost,
            COALESCE(v.price, p.price)::float::text AS retail
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.active AND p.status = 'publish'
        AND COALESCE(v.stock_qty,0) <= $1
        ${brandFilter}
      ORDER BY v.stock_qty ASC, sold_30d DESC, p.brand
      LIMIT $2`,
    args,
  );

  return rows.map((r) => {
    const stock = Number(r.stock_qty);
    const sold = Number(r.sold_30d);
    const suggested = Math.max(threshold * 2 - stock, sold, stock === 0 ? threshold : 1);
    return {
      variant_id: Number(r.variant_id), product_id: Number(r.product_id),
      name: r.name, brand: r.brand, size: r.size,
      stock_qty: stock, sold_30d: sold, suggested,
      cost: Math.round(Number(r.cost ?? 0)), retail: Math.round(Number(r.retail ?? 0)),
    };
  });
}

/** Compact purchasing counters for the ERP overview. */
export async function getPurchasingStats(): Promise<{ draft: number; sent: number; open_value: number }> {
  const row = await q1<{ draft: string; sent: string; open_value: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE po.status = 'draft')::text AS draft,
       COUNT(*) FILTER (WHERE po.status = 'sent')::text  AS sent,
       COALESCE(SUM(i.qty * i.unit_cost) FILTER (WHERE po.status IN ('draft','sent')), 0)::float::text AS open_value
     FROM purchase_orders po
     LEFT JOIN purchase_order_items i ON i.po_id = po.id`,
  );
  return {
    draft: Number(row?.draft ?? 0),
    sent: Number(row?.sent ?? 0),
    open_value: Math.round(Number(row?.open_value ?? 0)),
  };
}
