import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, pool } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const perPage = Number(sp.get("perPage") ?? 50);
  const offset = (page - 1) * perPage;

  const where = status ? `WHERE r.status = '${status.replace(/'/g, "")}'` : "";
  const rows = await q(
    `SELECT r.*, COUNT(ri.id)::int AS item_count
     FROM returns r
     LEFT JOIN return_items ri ON ri.return_id = r.id
     ${where}
     GROUP BY r.id
     ORDER BY r.created_at DESC
     LIMIT $1 OFFSET $2`, [perPage, offset]
  );
  const tot = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM returns r ${where}`
  );
  return NextResponse.json({ returns: rows, total: Number(tot[0]?.n ?? 0) });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json();
  const { order_id, order_number, reason, note, items } = body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const total = (items ?? []).reduce((s: number, i: { price: number; qty: number }) => s + i.price * i.qty, 0);
    const ret = await client.query(
      `INSERT INTO returns (order_id, order_number, reason, note, total, author)
       VALUES ($1, $2, $3, $4, $5, 'admin') RETURNING *`,
      [order_id || null, order_number || "", reason || "", note || "", total]
    );
    const retId = ret.rows[0].id;

    for (const item of (items ?? [])) {
      await client.query(
        `INSERT INTO return_items (return_id, product_id, variant_id, name, size, qty, price, action)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [retId, item.product_id, item.variant_id || null, item.name, item.size, item.qty, item.price, item.action ?? "refund"]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: retId });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
