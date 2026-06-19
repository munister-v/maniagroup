import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, pool } from "@/lib/pg";

export const dynamic = "force-dynamic";

/** Look up a variant by barcode */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const barcode = req.nextUrl.searchParams.get("barcode") ?? "";
  if (!barcode) return NextResponse.json({ error: "barcode required" }, { status: 400 });

  const rows = await q(
    `SELECT pv.id AS variant_id, pv.product_id, pv.size, pv.stock_qty, pv.barcode,
            p.name, p.brand, p.sku, p.image_src
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     WHERE pv.barcode = $1
     LIMIT 1`,
    [barcode]
  );
  if (!rows.length) return NextResponse.json({ found: false });
  return NextResponse.json({ found: true, variant: rows[0] });
}

/** Adjust stock for a variant (after scanning) */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { variantId, productId, size, delta, type, note } = await req.json();
  if (!variantId || delta == null) return NextResponse.json({ error: "variantId + delta required" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `UPDATE product_variants SET stock_qty = GREATEST(0, stock_qty + $2), updated_at = now(), updated_by = 'scan'
       WHERE id = $1 RETURNING stock_qty`,
      [variantId, delta]
    );
    const newQty = res.rows[0]?.stock_qty ?? 0;
    await client.query(
      `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scan')`,
      [productId, variantId, size, type ?? "adjust", delta, newQty, note ?? "Сканер штрихкодів"]
    );
    // Recompute mirror
    await client.query(
      `UPDATE products SET stock_qty = (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants WHERE product_id = $1 AND active),
              is_in_stock = ((SELECT COALESCE(SUM(stock_qty),0) FROM product_variants WHERE product_id = $1 AND active) > 0),
              updated_at = now() WHERE id = $1`,
      [productId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, newQty });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}
