import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, q1 } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "register";
  const from   = sp.get("from") ?? "";
  const to     = sp.get("to")   ?? "";
  const status = sp.get("status") ?? "";
  const search = sp.get("q") ?? "";
  const page   = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const perPage = 50;

  // ── Реєстр замовлень ─────────────────────────────────────────────────
  if (report === "register") {
    const conds: string[] = ["1=1"];
    const bind: unknown[] = [];
    const p = (v: unknown) => { bind.push(v); return `$${bind.length}`; };

    if (from)   conds.push(`o.created_at >= ${p(from + "T00:00:00Z")}`);
    if (to)     conds.push(`o.created_at <= ${p(to   + "T23:59:59Z")}`);
    if (status) conds.push(`o.status = ${p(status)}`);
    if (search) {
      const like = "%" + search + "%";
      conds.push(`(o.number ILIKE ${p(like)} OR o.first_name ILIKE ${p(like)} OR o.last_name ILIKE ${p(like)} OR o.phone ILIKE ${p(like)} OR o.ttn ILIKE ${p(like)})`);
    }

    const where  = conds.join(" AND ");
    const offset = (page - 1) * perPage;

    const listBind = [...bind, perPage, offset];
    const rows = await q<{
      id: number; number: string; status: string; created_at: string;
      first_name: string; last_name: string; phone: string; email: string;
      shipping_city: string; shipping_method: string; payment_method: string; ttn: string;
      subtotal: string; discount: string; shipping_cost: string; total: string; coupon_code: string;
      items_count: string; items_qty: string;
    }>(
      `SELECT o.id, o.number, o.status, o.created_at,
              o.first_name, o.last_name, o.phone, o.email,
              o.shipping_city, o.shipping_method, o.payment_method, o.ttn,
              o.subtotal, o.discount, o.shipping_cost, o.total, o.coupon_code,
              COUNT(oi.id)::text AS items_count,
              COALESCE(SUM(oi.quantity),0)::text AS items_qty
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $${bind.length + 1} OFFSET $${bind.length + 2}`,
      listBind,
    );

    const countRow = await q1<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM orders o WHERE ${where}`,
      bind,
    );

    const summRow = await q1<{ revenue: string; orders: string; avg: string; discounts: string }>(
      `SELECT COALESCE(SUM(total),0)::int::text AS revenue,
              COUNT(*)::text AS orders,
              COALESCE(AVG(total) FILTER (WHERE total > 0),0)::int::text AS avg,
              COALESCE(SUM(discount),0)::int::text AS discounts
       FROM orders o WHERE ${where} AND status NOT IN ('cancelled','refunded')`,
      bind,
    );

    return NextResponse.json({
      orders: rows,
      total: Number(countRow?.cnt ?? 0),
      summary: summRow,
    });
  }

  // ── По місяцях ────────────────────────────────────────────────────────
  if (report === "monthly") {
    const year = parseInt(sp.get("year") ?? String(new Date().getFullYear()), 10);
    const rows = await q<{
      month: string; orders: string; revenue: string; avg_check: string;
      cancelled: string; discounts: string;
    }>(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Kiev', 'YYYY-MM') AS month,
              COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded'))::text AS orders,
              COALESCE(SUM(total)    FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS revenue,
              COALESCE(AVG(total)    FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS avg_check,
              COUNT(*)               FILTER (WHERE status = 'cancelled')::text AS cancelled,
              COALESCE(SUM(discount) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS discounts
       FROM orders
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY 1 ORDER BY 1`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );

    // Totals row
    const tot = await q1<{ revenue: string; orders: string; avg: string; discounts: string }>(
      `SELECT COALESCE(SUM(total),0)::int::text AS revenue,
              COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded'))::text AS orders,
              COALESCE(AVG(total) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS avg,
              COALESCE(SUM(discount) FILTER (WHERE status NOT IN ('cancelled','refunded')),0)::int::text AS discounts
       FROM orders WHERE created_at >= $1 AND created_at < $2`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );

    return NextResponse.json({ months: rows, totals: tot, year });
  }

  // ── Топ товарів (з замовлень) ─────────────────────────────────────────
  if (report === "products") {
    const conds = ["o.status NOT IN ('cancelled','refunded')"];
    const bind: unknown[] = [];
    const p = (v: unknown) => { bind.push(v); return `$${bind.length}`; };
    if (from) conds.push(`o.created_at >= ${p(from + "T00:00:00Z")}`);
    if (to)   conds.push(`o.created_at <= ${p(to   + "T23:59:59Z")}`);

    const rows = await q<{
      product_id: string; name: string; brand: string;
      qty: string; revenue: string; avg_price: string;
    }>(
      `SELECT oi.product_id, oi.name, oi.brand,
              SUM(oi.quantity)::text AS qty,
              SUM(oi.line_total)::int::text AS revenue,
              AVG(oi.price)::int::text AS avg_price
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${conds.join(" AND ")}
       GROUP BY oi.product_id, oi.name, oi.brand
       ORDER BY SUM(oi.line_total) DESC
       LIMIT 100`,
      bind,
    );

    return NextResponse.json({ products: rows });
  }

  // ── Інвентаризація ────────────────────────────────────────────────────
  if (report === "inventory") {
    const summary = await q1<{
      total: string; in_stock: string; out_stock: string;
      stock_value: string; avg_price: string; no_photo: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE is_in_stock = TRUE)::text AS in_stock,
              COUNT(*) FILTER (WHERE is_in_stock = FALSE)::text AS out_stock,
              COALESCE(SUM(price) FILTER (WHERE is_in_stock = TRUE AND price > 0),0)::int::text AS stock_value,
              COALESCE(AVG(price) FILTER (WHERE price > 0),0)::int::text AS avg_price,
              COUNT(*) FILTER (WHERE images::text IN ('[]','null','') OR images IS NULL)::text AS no_photo
       FROM products WHERE status = 'publish'`,
    );

    const byBrand = await q<{
      brand: string; in_stock: string; out_stock: string; stock_value: string;
    }>(
      `SELECT brand,
              COUNT(*) FILTER (WHERE is_in_stock = TRUE)::text AS in_stock,
              COUNT(*) FILTER (WHERE is_in_stock = FALSE)::text AS out_stock,
              COALESCE(SUM(price) FILTER (WHERE is_in_stock = TRUE AND price > 0),0)::int::text AS stock_value
       FROM products
       WHERE status = 'publish' AND brand <> '' AND brand <> 'Mania Group'
       GROUP BY brand
       ORDER BY SUM(price) FILTER (WHERE is_in_stock = TRUE AND price > 0) DESC NULLS LAST
       LIMIT 20`,
    );

    return NextResponse.json({ summary, by_brand: byBrand });
  }

  return NextResponse.json({ error: "Unknown report" }, { status: 400 });
}
