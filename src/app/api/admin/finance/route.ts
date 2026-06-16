import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, q1 } from "@/lib/pg";
import { getFinanceSettings, costSql, orderCogsSql } from "@/lib/finance";

export const dynamic = "force-dynamic";

const SOLD = "o.status NOT IN ('cancelled','refunded')";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "dashboard";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const settings = await getFinanceSettings();
  const cogs = orderCogsSql(settings); // per-unit COGS for order_items oi (+ p, cr joins)

  const dateConds = (alias = "o") => {
    const conds: string[] = [];
    const bind: unknown[] = [];
    if (from) { bind.push(from + "T00:00:00Z"); conds.push(`${alias}.created_at >= $${bind.length}`); }
    if (to)   { bind.push(to   + "T23:59:59Z"); conds.push(`${alias}.created_at <= $${bind.length}`); }
    return { where: conds.length ? " AND " + conds.join(" AND ") : "", bind };
  };

  // ── Dashboard KPIs (revenue, COGS, gross/net profit, margin) ──────────────
  if (report === "dashboard") {
    const { where, bind } = dateConds();
    const rev = await q1<{ revenue: string; orders: string; cogs: string }>(
      `SELECT COALESCE(SUM(oi.line_total),0)::float::text       AS revenue,
              COUNT(DISTINCT o.id)::text                         AS orders,
              COALESCE(SUM(${cogs} * oi.quantity),0)::float::text AS cogs
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN cost_rules cr ON cr.brand = oi.brand
       WHERE ${SOLD}${where}`,
      bind,
    );
    const expRow = await q1<{ total: string }>(
      `SELECT COALESCE(SUM(amount),0)::float::text AS total FROM expenses
       WHERE 1=1${from ? " AND spent_on >= $1" : ""}${to ? ` AND spent_on <= $${from ? 2 : 1}` : ""}`,
      [from, to].filter(Boolean),
    );
    const revenue = Number(rev?.revenue ?? 0);
    const cogsVal = Number(rev?.cogs ?? 0);
    const expenses = Number(expRow?.total ?? 0);
    const gross = revenue - cogsVal;
    const net = gross - expenses;
    return NextResponse.json({
      revenue, cogs: cogsVal, gross, expenses, net,
      orders: Number(rev?.orders ?? 0),
      grossMargin: revenue > 0 ? gross / revenue : 0,
      netMargin: revenue > 0 ? net / revenue : 0,
      settings,
    });
  }

  // ── Profit & Loss by month for a year ─────────────────────────────────────
  if (report === "pnl") {
    const year = parseInt(sp.get("year") ?? String(new Date().getFullYear()), 10);
    const rows = await q<{ month: string; revenue: string; cogs: string }>(
      `SELECT TO_CHAR(o.created_at AT TIME ZONE 'Europe/Kiev','YYYY-MM') AS month,
              COALESCE(SUM(oi.line_total),0)::float::text        AS revenue,
              COALESCE(SUM(${cogs} * oi.quantity),0)::float::text AS cogs
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN cost_rules cr ON cr.brand = oi.brand
       WHERE ${SOLD} AND o.created_at >= $1 AND o.created_at < $2
       GROUP BY 1 ORDER BY 1`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );
    const exp = await q<{ month: string; total: string }>(
      `SELECT TO_CHAR(spent_on,'YYYY-MM') AS month, SUM(amount)::float::text AS total
       FROM expenses WHERE spent_on >= $1 AND spent_on < $2 GROUP BY 1`,
      [`${year}-01-01`, `${year + 1}-01-01`],
    );
    const expByMonth = new Map(exp.map((e) => [e.month, Number(e.total)]));
    const months = rows.map((r) => {
      const revenue = Number(r.revenue), cogsV = Number(r.cogs);
      const expenses = expByMonth.get(r.month) ?? 0;
      const gross = revenue - cogsV;
      return { month: r.month, revenue, cogs: cogsV, gross, expenses, net: gross - expenses };
    });
    return NextResponse.json({ year, months });
  }

  // ── Profitability by product or brand ─────────────────────────────────────
  if (report === "profitability") {
    const by = sp.get("by") === "brand" ? "brand" : "product";
    const { where, bind } = dateConds();
    const groupSel = by === "brand"
      ? "oi.brand AS label, '' AS sublabel"
      : "oi.name AS label, oi.brand AS sublabel";
    const groupBy = by === "brand" ? "oi.brand" : "oi.product_id, oi.name, oi.brand";
    const rows = await q<{
      label: string; sublabel: string; qty: string; revenue: string; cogs: string;
    }>(
      `SELECT ${groupSel},
              SUM(oi.quantity)::text                              AS qty,
              SUM(oi.line_total)::float::text                     AS revenue,
              SUM(${cogs} * oi.quantity)::float::text             AS cogs
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN cost_rules cr ON cr.brand = oi.brand
       WHERE ${SOLD}${where}
       GROUP BY ${groupBy}
       ORDER BY SUM(oi.line_total) - SUM(${cogs} * oi.quantity) DESC
       LIMIT 200`,
      bind,
    );
    const items = rows.map((r) => {
      const revenue = Number(r.revenue), cogsV = Number(r.cogs);
      const profit = revenue - cogsV;
      return {
        label: r.label || "—", sublabel: r.sublabel, qty: Number(r.qty),
        revenue, cogs: cogsV, profit,
        margin: revenue > 0 ? profit / revenue : 0,
        markup: cogsV > 0 ? profit / cogsV : 0,
      };
    });
    return NextResponse.json({ by, items });
  }

  // ── Cash flow (money in / expected / out) by day ──────────────────────────
  if (report === "cashflow") {
    const { where, bind } = dateConds();
    const rows = await q<{ day: string; paid: string; pending: string; refunded: string }>(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'Europe/Kiev','YYYY-MM-DD') AS day,
              COALESCE(SUM(total) FILTER (WHERE status IN ('completed','processing')),0)::float::text AS paid,
              COALESCE(SUM(total) FILTER (WHERE status IN ('pending','on-hold')),0)::float::text      AS pending,
              COALESCE(SUM(total) FILTER (WHERE status = 'refunded'),0)::float::text                  AS refunded
       FROM orders o WHERE 1=1${where.replace(/^ AND /, " AND ")}
       GROUP BY 1 ORDER BY 1`,
      bind,
    );
    const expRows = await q<{ day: string; total: string }>(
      `SELECT spent_on::text AS day, SUM(amount)::float::text AS total FROM expenses
       WHERE 1=1${from ? " AND spent_on >= $1" : ""}${to ? ` AND spent_on <= $${from ? 2 : 1}` : ""}
       GROUP BY 1`,
      [from, to].filter(Boolean),
    );
    const expByDay = new Map(expRows.map((e) => [e.day, Number(e.total)]));
    const days = rows.map((r) => ({
      day: r.day, paid: Number(r.paid), pending: Number(r.pending),
      refunded: Number(r.refunded), expenses: expByDay.get(r.day) ?? 0,
    }));
    const totals = days.reduce(
      (a, d) => ({
        paid: a.paid + d.paid, pending: a.pending + d.pending,
        refunded: a.refunded + d.refunded, expenses: a.expenses + d.expenses,
      }),
      { paid: 0, pending: 0, refunded: 0, expenses: 0 },
    );
    return NextResponse.json({ days, totals, net: totals.paid - totals.refunded - totals.expenses });
  }

  // ── Inventory valuation at cost & retail (real units, dead stock) ─────────
  if (report === "inventory") {
    const unitCost = costSql("p", settings, { brandPctCol: "cr.pct" });
    // Treat 0/NULL stock_qty on in-stock items as 1 unit so valuation isn't zeroed.
    const units = "GREATEST(COALESCE(p.stock_qty,0), CASE WHEN p.is_in_stock THEN 1 ELSE 0 END)";
    const summary = await q1<{
      skus: string; units: string; cost_value: string; retail_value: string; out_units: string;
    }>(
      `SELECT COUNT(*) FILTER (WHERE p.is_in_stock)::text                       AS skus,
              COALESCE(SUM(${units}) FILTER (WHERE p.is_in_stock),0)::text       AS units,
              COALESCE(SUM(${unitCost} * ${units}) FILTER (WHERE p.is_in_stock),0)::float::text AS cost_value,
              COALESCE(SUM(p.price * ${units}) FILTER (WHERE p.is_in_stock),0)::float::text      AS retail_value,
              COUNT(*) FILTER (WHERE NOT p.is_in_stock)::text                    AS out_units
       FROM products p LEFT JOIN cost_rules cr ON cr.brand = p.brand
       WHERE p.status = 'publish'`,
    );
    const byBrand = await q<{ brand: string; units: string; cost_value: string; retail_value: string }>(
      `SELECT p.brand,
              COALESCE(SUM(${units}),0)::text                       AS units,
              COALESCE(SUM(${unitCost} * ${units}),0)::float::text   AS cost_value,
              COALESCE(SUM(p.price * ${units}),0)::float::text       AS retail_value
       FROM products p LEFT JOIN cost_rules cr ON cr.brand = p.brand
       WHERE p.status = 'publish' AND p.is_in_stock AND p.brand <> '' AND p.brand <> 'Mania Group'
       GROUP BY p.brand
       ORDER BY SUM(${unitCost} * ${units}) DESC NULLS LAST
       LIMIT 25`,
    );
    const cv = Number(summary?.cost_value ?? 0), rv = Number(summary?.retail_value ?? 0);
    return NextResponse.json({
      summary: {
        skus: Number(summary?.skus ?? 0),
        units: Number(summary?.units ?? 0),
        cost_value: cv,
        retail_value: rv,
        potential_profit: rv - cv,
        out_units: Number(summary?.out_units ?? 0),
      },
      by_brand: byBrand.map((b) => ({
        brand: b.brand, units: Number(b.units),
        cost_value: Number(b.cost_value), retail_value: Number(b.retail_value),
      })),
    });
  }

  return NextResponse.json({ error: "Unknown report" }, { status: 400 });
}
