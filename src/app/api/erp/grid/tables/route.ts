import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

/**
 * Named tables for grid formula VLOOKUP.
 * Returns compact datasets: RECEIPTS, ORDERS, SUPPLIERS, PRODUCTS.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const [receipts, orders, suppliers, products] = await Promise.all([
    // RECEIPTS: one row per SKU — total received qty + weighted avg cost
    q<{ sku: string; name: string; qty: string; cost: string }>(
      `SELECT p.sku, p.name,
              SUM(ri.qty)::text AS qty,
              ROUND(SUM(ri.qty * ri.unit_cost) / NULLIF(SUM(ri.qty),0), 2)::text AS cost
         FROM receipt_items ri
         JOIN products p ON p.id = ri.product_id
         JOIN receipts r ON r.id = ri.receipt_id
        WHERE r.status = 'posted' AND p.sku <> ''
        GROUP BY p.sku, p.name
        ORDER BY p.name`,
    ),

    // ORDERS: one row per SKU+size — total ordered qty (non-cancelled)
    q<{ sku: string; size: string; qty: string }>(
      `SELECT p.sku, oi.variation AS size, SUM(oi.quantity)::text AS qty
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('cancelled','refunded') AND p.sku <> ''
        GROUP BY p.sku, oi.variation`,
    ),

    // SUPPLIERS: name, total spend, units
    q<{ name: string; total: string; units: string }>(
      `SELECT s.name,
              COALESCE(SUM(ri.qty * ri.unit_cost),0)::text AS total,
              COALESCE(SUM(ri.qty),0)::text AS units
         FROM suppliers s
         LEFT JOIN receipts r ON r.supplier_id = s.id AND r.status = 'posted'
         LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
        GROUP BY s.name
        ORDER BY s.name`,
    ),

    // PRODUCTS: compact catalog — sku, brand, price, cost, stock
    q<{ sku: string; brand: string; name: string; price: string; cost: string; stock: string }>(
      `SELECT sku, brand, name,
              price::float::text AS price,
              COALESCE(cost_price,0)::float::text AS cost,
              COALESCE(stock_qty,0)::text AS stock
         FROM products
        WHERE sku <> ''
        ORDER BY brand, name
        LIMIT 5000`,
    ),
  ]);

  return NextResponse.json({
    RECEIPTS: receipts.map((r) => ({
      sku: r.sku, name: r.name,
      qty: Number(r.qty), cost: Number(r.cost),
    })),
    ORDERS: orders.map((r) => ({
      sku: r.sku, size: r.size, qty: Number(r.qty),
    })),
    SUPPLIERS: suppliers.map((r) => ({
      name: r.name, total: Number(r.total), units: Number(r.units),
    })),
    PRODUCTS: products.map((r) => ({
      sku: r.sku, brand: r.brand, name: r.name,
      price: Number(r.price), cost: Number(r.cost), stock: Number(r.stock),
    })),
  });
}
