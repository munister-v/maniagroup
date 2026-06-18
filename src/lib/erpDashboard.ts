/**
 * ERP dashboard (Огляд) — the "сверка и актуалізація обліку" command center.
 * Ties together inventory (Товари), real purchase cost (Прихід → cost_price),
 * suppliers (E4) and the finance engine into one financial+stock picture:
 *
 *   • inventory value at COST (finance.costSql — receipt cost first, then derived)
 *   • retail value & potential margin sitting on the shelf
 *   • cost coverage — how many products have real receipt cost vs a guessed one
 *   • purchases this month / total (posted receipts)
 *   • low-stock variants + stock-mirror drift (needs звірка)
 *   • recent stock movements
 *
 * Server-only.
 */

import { q, q1 } from "./pg";
import { getFinanceSettings, costSql } from "./finance";
import { listSuppliers } from "./suppliers";
import { getStoreSettings } from "./settings";
import { getPurchasingStats } from "./purchasing";

export type ErpDashboard = {
  inventory: { positions: number; in_stock: number; out_stock: number; units: number; variants: number; unknown_qty: number };
  value: { cost: number; retail: number; margin: number; margin_pct: number };
  coverage: { from_receipt: number; from_manual: number; derived: number; total: number };
  purchases: { receipts_month: number; spent_month: number; units_month: number; spent_total: number };
  reconciliation: { drift: number };
  purchasing: { draft: number; sent: number; open_value: number };
  low_stock: { id: string; name: string; brand: string; size: string; qty: number }[];
  movements: { id: number; type: string; delta: number; qty_after: number | null; size: string; name: string; brand: string; created_at: string }[];
  top_suppliers: { id: number; name: string; total: number; units: number }[];
};

export async function getErpDashboard(): Promise<ErpDashboard> {
  const [settings, storeSettings] = await Promise.all([getFinanceSettings(), getStoreSettings()]);
  const cost = costSql("p", settings, { brandPctCol: "cr.pct" });
  const lowStockThreshold = Math.max(1, Number(storeSettings.low_stock_threshold) || 3);

  const [inv, val, cov, pur, drift, lowStock, movements, suppliers, purchasing] = await Promise.all([
    // Inventory counts
    q1<{ positions: string; in_stock: string; out_stock: string; units: string; variants: string; unknown_qty: string }>(
      `SELECT COUNT(*)::text AS positions,
              COUNT(*) FILTER (WHERE is_in_stock)::text AS in_stock,
              COUNT(*) FILTER (WHERE NOT is_in_stock)::text AS out_stock,
              COALESCE(SUM(stock_qty),0)::text AS units,
              (SELECT COUNT(*) FROM product_variants)::text AS variants,
              COUNT(*) FILTER (WHERE is_in_stock AND COALESCE(stock_qty,0) = 0)::text AS unknown_qty
         FROM products WHERE status = 'publish'`,
    ),

    // Inventory value at cost & retail (weighted by stock_qty)
    q1<{ cost: string; retail: string }>(
      `SELECT COALESCE(SUM(p.stock_qty * (${cost})),0)::float::text AS cost,
              COALESCE(SUM(p.stock_qty * p.price),0)::float::text AS retail
         FROM products p
         LEFT JOIN cost_rules cr ON cr.brand = p.brand
        WHERE p.status = 'publish' AND COALESCE(p.stock_qty,0) > 0`,
    ),

    // Cost coverage
    q1<{ from_receipt: string; from_manual: string; derived: string; total: string }>(
      `SELECT COUNT(*) FILTER (WHERE cost_source = 'receipt')::text AS from_receipt,
              COUNT(*) FILTER (WHERE cost_source = 'manual')::text AS from_manual,
              COUNT(*) FILTER (WHERE cost_price IS NULL OR cost_price = 0)::text AS derived,
              COUNT(*)::text AS total
         FROM products WHERE status = 'publish'`,
    ),

    // Purchases (posted receipts)
    q1<{ receipts_month: string; spent_month: string; units_month: string; spent_total: string }>(
      `SELECT COUNT(DISTINCT r.id) FILTER (WHERE r.posted_at >= date_trunc('month', now()))::text AS receipts_month,
              COALESCE(SUM(ri.qty * ri.unit_cost) FILTER (WHERE r.posted_at >= date_trunc('month', now())),0)::float::text AS spent_month,
              COALESCE(SUM(ri.qty) FILTER (WHERE r.posted_at >= date_trunc('month', now())),0)::text AS units_month,
              COALESCE(SUM(ri.qty * ri.unit_cost),0)::float::text AS spent_total
         FROM receipts r JOIN receipt_items ri ON ri.receipt_id = r.id
        WHERE r.status = 'posted'`,
    ),

    // Stock-mirror drift: products whose products.stock_qty ≠ Σ active variants
    q1<{ drift: string }>(
      `SELECT COUNT(*)::text AS drift FROM products p
        WHERE p.status = 'publish'
          AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
          AND COALESCE(p.stock_qty,0) <> (SELECT COALESCE(SUM(stock_qty),0) FROM product_variants WHERE product_id = p.id AND active)`,
    ),

    // Low-stock variants (threshold from store settings)
    q<{ id: string; name: string; brand: string; size: string; qty: number }>(
      `SELECT p.id::text, p.name, p.brand, v.size, v.stock_qty AS qty
         FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.active AND v.stock_qty > 0 AND v.stock_qty <= $1
        ORDER BY v.stock_qty ASC, p.brand LIMIT 24`,
      [lowStockThreshold],
    ),

    // Recent movements
    q<{ id: number; type: string; delta: number; qty_after: number | null; size: string; name: string; brand: string; created_at: string }>(
      `SELECT m.id, m.type, m.delta, m.qty_after, m.size, p.name, p.brand, m.created_at
         FROM stock_movements m JOIN products p ON p.id = m.product_id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 12`,
    ),

    listSuppliers(),

    getPurchasingStats(),
  ]);

  const costVal = Number(val?.cost ?? 0);
  const retailVal = Number(val?.retail ?? 0);
  const margin = retailVal - costVal;

  return {
    inventory: {
      positions: Number(inv?.positions ?? 0),
      in_stock: Number(inv?.in_stock ?? 0),
      out_stock: Number(inv?.out_stock ?? 0),
      units: Number(inv?.units ?? 0),
      variants: Number(inv?.variants ?? 0),
      unknown_qty: Number(inv?.unknown_qty ?? 0),
    },
    value: {
      cost: Math.round(costVal),
      retail: Math.round(retailVal),
      margin: Math.round(margin),
      margin_pct: retailVal > 0 ? Math.round((margin / retailVal) * 100) : 0,
    },
    coverage: {
      from_receipt: Number(cov?.from_receipt ?? 0),
      from_manual: Number(cov?.from_manual ?? 0),
      derived: Number(cov?.derived ?? 0),
      total: Number(cov?.total ?? 0),
    },
    purchases: {
      receipts_month: Number(pur?.receipts_month ?? 0),
      spent_month: Math.round(Number(pur?.spent_month ?? 0)),
      units_month: Number(pur?.units_month ?? 0),
      spent_total: Math.round(Number(pur?.spent_total ?? 0)),
    },
    reconciliation: { drift: Number(drift?.drift ?? 0) },
    purchasing,
    low_stock: lowStock.map((r) => ({ id: r.id, name: r.name, brand: r.brand, size: r.size, qty: Number(r.qty) })),
    movements: movements.map((m) => ({ ...m, delta: Number(m.delta), qty_after: m.qty_after != null ? Number(m.qty_after) : null })),
    top_suppliers: suppliers
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((s) => ({ id: s.id, name: s.name, total: Math.round(s.total), units: s.units })),
  };
}
