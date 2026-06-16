/**
 * Suppliers (постачальники) — reusable supplier records for the receiving flow.
 * Each receipt may reference a supplier; the supplier *name* is snapshotted onto
 * the receipt so historical documents stay correct even if the record is renamed
 * or deleted. The list query joins posted receipts for purchasing analytics.
 */

import { q, q1 } from "./pg";

export type Supplier = {
  id: number; name: string; contact: string; phone: string; note: string; created_at: string;
};

export type SupplierWithStats = Supplier & {
  receipts: number;      // posted receipts count
  units: number;         // total units received
  total: number;         // total purchase value (posted)
  last_receipt: string | null;
};

export async function listSuppliers(): Promise<SupplierWithStats[]> {
  return q<SupplierWithStats>(
    `SELECT s.id, s.name, s.contact, s.phone, s.note, s.created_at,
            COALESCE(st.receipts, 0)::int AS receipts,
            COALESCE(st.units, 0)::int    AS units,
            COALESCE(st.total, 0)::float  AS total,
            st.last_receipt::text         AS last_receipt
       FROM suppliers s
       LEFT JOIN (
         SELECT r.supplier_id,
                COUNT(DISTINCT r.id)               AS receipts,
                COALESCE(SUM(ri.qty), 0)           AS units,
                COALESCE(SUM(ri.qty * ri.unit_cost), 0) AS total,
                MAX(r.doc_date)                    AS last_receipt
           FROM receipts r
           JOIN receipt_items ri ON ri.receipt_id = r.id
          WHERE r.status = 'posted' AND r.supplier_id IS NOT NULL
          GROUP BY r.supplier_id
       ) st ON st.supplier_id = s.id
      ORDER BY s.name`,
  );
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  return q1<Supplier>(
    "SELECT id, name, contact, phone, note, created_at FROM suppliers WHERE id = $1", [id],
  );
}

export async function createSupplier(input: { name: string; contact?: string; phone?: string; note?: string }): Promise<number> {
  const row = await q1<{ id: number }>(
    `INSERT INTO suppliers (name, contact, phone, note) VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.name.trim(), input.contact ?? "", input.phone ?? "", input.note ?? ""],
  );
  return row!.id;
}

export async function updateSupplier(id: number, patch: { name?: string; contact?: string; phone?: string; note?: string }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (patch.name !== undefined) add("name", patch.name.trim());
  if (patch.contact !== undefined) add("contact", patch.contact);
  if (patch.phone !== undefined) add("phone", patch.phone);
  if (patch.note !== undefined) add("note", patch.note);
  if (!sets.length) return;
  vals.push(id);
  await q(`UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  // Keep the snapshot on draft receipts in sync (posted ones stay frozen).
  if (patch.name !== undefined) {
    await q("UPDATE receipts SET supplier = $2 WHERE supplier_id = $1 AND status = 'draft'", [id, patch.name.trim()]);
  }
}

export async function deleteSupplier(id: number): Promise<void> {
  // Detach receipts (keep their snapshotted name), then drop the record.
  await q("UPDATE receipts SET supplier_id = NULL WHERE supplier_id = $1", [id]);
  await q("DELETE FROM suppliers WHERE id = $1", [id]);
}
