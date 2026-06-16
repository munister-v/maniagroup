import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { getFinanceSettings, costSql } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** List products (searchable) with their resolved cost + margin, for the editor. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const search = (sp.get("q") ?? "").trim();
  const settings = await getFinanceSettings();
  const unitCost = costSql("p", settings, { brandPctCol: "cr.pct" });

  const conds = ["p.status = 'publish'", "p.is_in_stock"];
  const bind: unknown[] = [];
  if (search) {
    bind.push("%" + search + "%");
    conds.push(`(p.name ILIKE $${bind.length} OR p.brand ILIKE $${bind.length} OR p.sku ILIKE $${bind.length})`);
  }
  bind.push(50);

  const rows = await q<{
    id: string; name: string; brand: string; sku: string;
    price: string; regular_price: string; cost_price: string | null;
    cost_source: string; resolved_cost: string;
  }>(
    `SELECT p.id::text, p.name, p.brand, p.sku,
            p.price::float::text AS price, p.regular_price::float::text AS regular_price,
            p.cost_price::float::text AS cost_price, p.cost_source,
            (${unitCost})::float::text AS resolved_cost
     FROM products p LEFT JOIN cost_rules cr ON cr.brand = p.brand
     WHERE ${conds.join(" AND ")}
     ORDER BY p.brand, p.name
     LIMIT $${bind.length}`,
    bind,
  );

  return NextResponse.json({
    settings,
    products: rows.map((r) => {
      const price = Number(r.price), cost = Number(r.resolved_cost);
      const profit = price - cost;
      return {
        id: r.id, name: r.name, brand: r.brand, sku: r.sku,
        price, regular_price: Number(r.regular_price),
        cost_price: r.cost_price != null ? Number(r.cost_price) : null,
        cost_source: r.cost_source,
        resolved_cost: cost,
        profit,
        margin: price > 0 ? profit / price : 0,
      };
    }),
  });
}

/** Set or clear a product's manual cost. amount=null clears it (back to derived). */
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { id?: number | string; cost?: number | null };
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (b.cost == null || Number(b.cost) <= 0) {
    await q("UPDATE products SET cost_price = NULL, cost_source = '' WHERE id = $1", [id]);
  } else {
    await q("UPDATE products SET cost_price = $2, cost_source = 'manual' WHERE id = $1", [id, Number(b.cost)]);
  }
  return NextResponse.json({ ok: true });
}
