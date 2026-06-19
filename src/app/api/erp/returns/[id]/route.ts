import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, pool } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const [ret] = await q(`SELECT * FROM returns WHERE id = $1`, [id]);
  if (!ret) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await q(`SELECT ri.*, p.name AS product_name FROM return_items ri LEFT JOIN products p ON p.id = ri.product_id WHERE ri.return_id = $1`, [id]);
  return NextResponse.json({ return: ret, items });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [id];

  if (body.status !== undefined) {
    vals.push(body.status);
    sets.push(`status = $${vals.length}`);
    if (["refunded", "exchanged"].includes(body.status)) {
      sets.push("resolved_at = now()");
    }
  }
  if (body.note !== undefined) { vals.push(body.note); sets.push(`note = $${vals.length}`); }
  if (body.reason !== undefined) { vals.push(body.reason); sets.push(`reason = $${vals.length}`); }

  // If status → received: add stock back
  if (body.status === "received") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE returns SET ${sets.join(", ")} WHERE id = $1`, vals);
      const items = await client.query(
        `SELECT * FROM return_items WHERE return_id = $1`, [id]
      );
      for (const item of items.rows) {
        if (!item.variant_id) continue;
        await client.query(
          `UPDATE product_variants SET stock_qty = stock_qty + $1, updated_at = now(), updated_by = 'return' WHERE id = $2`,
          [item.qty, item.variant_id]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
           SELECT $1, $2, $3, 'return', $4, stock_qty, 'Повернення #' || $5, 'admin'
           FROM product_variants WHERE id = $2`,
          [item.product_id, item.variant_id, item.size, item.qty, id]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: String(e) }, { status: 500 });
    } finally {
      client.release();
    }
  } else {
    await q(`UPDATE returns SET ${sets.join(", ")} WHERE id = $1`, vals);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  await q(`DELETE FROM returns WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
