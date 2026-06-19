import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { sendTelegram } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const threshold = Number((await q<{ val: string }>(`SELECT val FROM store_settings WHERE key = 'low_stock_threshold'`))[0]?.val ?? 3);
  const sp = req.nextUrl.searchParams;
  const limit = Number(sp.get("limit") ?? 100);

  const low = await q<{ id: string; name: string; brand: string; stock_qty: string; status: string }>(
    `SELECT id::text, name, brand, stock_qty::text, status
     FROM products
     WHERE stock_qty <= $1 AND stock_qty >= 0 AND status = 'publish'
     ORDER BY stock_qty ASC, brand, name
     LIMIT $2`, [threshold, limit]
  );
  return NextResponse.json({ threshold, products: low, total: low.length });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json();

  if (body.action === "set_threshold") {
    const t = Math.max(0, Number(body.threshold) || 3);
    await q(`INSERT INTO store_settings (key, val) VALUES ('low_stock_threshold', $1) ON CONFLICT (key) DO UPDATE SET val = $1`, [String(t)]);
    return NextResponse.json({ ok: true, threshold: t });
  }

  if (body.action === "send_alerts") {
    const threshold = Number((await q<{ val: string }>(`SELECT val FROM store_settings WHERE key = 'low_stock_threshold'`))[0]?.val ?? 3);
    const low = await q<{ id: string; name: string; brand: string; stock_qty: string }>(
      `SELECT id::text, name, brand, stock_qty::text FROM products WHERE stock_qty <= $1 AND stock_qty >= 0 AND status = 'publish' ORDER BY stock_qty LIMIT 50`,
      [threshold]
    );
    if (!low.length) return NextResponse.json({ ok: true, sent: 0 });

    const lines = low.map((p) => `• ${p.brand} — ${p.name}: <b>${p.stock_qty} од.</b>`).join("\n");
    await sendTelegram(`⚠️ <b>Низький залишок (поріг: ${threshold} од.)</b>\n\n${lines}`);
    return NextResponse.json({ ok: true, sent: low.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
