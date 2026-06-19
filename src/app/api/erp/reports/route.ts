import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") ?? "month"; // month | quarter | year
  const type = sp.get("type") ?? "sales"; // sales | margin | stock | turnover

  const days = period === "year" ? 365 : period === "quarter" ? 90 : 30;

  if (type === "sales") {
    // Sales by day
    const byDay = await q<{ d: string; revenue: string; orders: string }>(
      `SELECT date_trunc('day', created_at)::date::text AS d,
              SUM(total)::numeric(12,2)::text AS revenue,
              COUNT(*)::text AS orders
       FROM orders
       WHERE created_at >= now() - interval '${days} days'
         AND status NOT IN ('cancelled')
       GROUP BY 1 ORDER BY 1`
    );
    // Sales by brand
    const byBrand = await q<{ brand: string; revenue: string; units: string }>(
      `SELECT oi.brand, SUM(oi.line_total)::numeric(12,2)::text AS revenue, SUM(oi.quantity)::text AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= now() - interval '${days} days'
         AND o.status NOT IN ('cancelled')
       GROUP BY oi.brand ORDER BY SUM(oi.line_total) DESC LIMIT 20`
    );
    // Sales by category
    const byCategory = await q<{ category: string; revenue: string; units: string }>(
      `SELECT p.category, SUM(oi.line_total)::numeric(12,2)::text AS revenue, SUM(oi.quantity)::text AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.created_at >= now() - interval '${days} days'
         AND o.status NOT IN ('cancelled')
       GROUP BY p.category ORDER BY SUM(oi.line_total) DESC LIMIT 20`
    );
    // Totals
    const totals = await q<{ revenue: string; orders: string; units: string; avg_order: string }>(
      `SELECT SUM(o.total)::numeric(12,2)::text AS revenue,
              COUNT(DISTINCT o.id)::text AS orders,
              SUM(oi.quantity)::text AS units,
              AVG(o.total)::numeric(10,2)::text AS avg_order
       FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.created_at >= now() - interval '${days} days'
         AND o.status NOT IN ('cancelled')`
    );
    return NextResponse.json({ byDay, byBrand, byCategory, totals: totals[0] });
  }

  if (type === "margin") {
    // Margin by brand
    const byBrand = await q<{ brand: string; revenue: string; cost: string; margin_pct: string }>(
      `SELECT oi.brand,
              SUM(oi.line_total)::numeric(12,2)::text AS revenue,
              SUM(oi.cost_price * oi.quantity)::numeric(12,2)::text AS cost,
              CASE WHEN SUM(oi.line_total) > 0
                   THEN ((SUM(oi.line_total) - SUM(oi.cost_price * oi.quantity)) / SUM(oi.line_total) * 100)::numeric(5,1)::text
                   ELSE '0' END AS margin_pct
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= now() - interval '${days} days'
         AND o.status NOT IN ('cancelled')
       GROUP BY oi.brand ORDER BY SUM(oi.line_total) DESC LIMIT 20`
    );
    return NextResponse.json({ byBrand });
  }

  if (type === "stock") {
    // Stock value by brand
    const byBrand = await q<{ brand: string; units: string; retail_value: string; cost_value: string }>(
      `SELECT p.brand,
              SUM(pv.stock_qty)::text AS units,
              SUM(pv.stock_qty * p.price)::numeric(12,2)::text AS retail_value,
              SUM(pv.stock_qty * COALESCE(p.cost_price, p.price * 0.6))::numeric(12,2)::text AS cost_value
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.active = true AND pv.stock_qty > 0
       GROUP BY p.brand ORDER BY SUM(pv.stock_qty * p.price) DESC LIMIT 20`
    );
    // Low stock products
    const lowStock = await q<{ id: string; name: string; brand: string; stock_qty: string }>(
      `SELECT id::text, name, brand, stock_qty::text FROM products WHERE stock_qty <= 3 AND stock_qty >= 0 AND status = 'publish' ORDER BY stock_qty, brand LIMIT 50`
    );
    return NextResponse.json({ byBrand, lowStock });
  }

  if (type === "turnover") {
    // Stock movements summary by type
    const byType = await q<{ type: string; count: string; total_delta: string }>(
      `SELECT type, COUNT(*)::text AS count, SUM(ABS(delta))::text AS total_delta
       FROM stock_movements
       WHERE created_at >= now() - interval '${days} days'
       GROUP BY type ORDER BY COUNT(*) DESC`
    );
    // Top moving products
    const topMoved = await q<{ product_id: string; name: string; brand: string; units_sold: string }>(
      `SELECT sm.product_id::text, p.name, p.brand, SUM(ABS(sm.delta))::text AS units_sold
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       WHERE sm.type = 'sale' AND sm.created_at >= now() - interval '${days} days'
       GROUP BY sm.product_id, p.name, p.brand
       ORDER BY SUM(ABS(sm.delta)) DESC LIMIT 20`
    );
    return NextResponse.json({ byType, topMoved });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
