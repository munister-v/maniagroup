import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  listErpProducts, erpOverview, erpStatusCounts, bulkSetStatus, createErpProduct,
  type ErpProductInput, type ErpStatus,
} from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as ErpProductInput;
  if (!b.name?.trim()) return NextResponse.json({ error: "Вкажіть назву товару" }, { status: 400 });
  if (!(b.regular_price > 0)) return NextResponse.json({ error: "Вкажіть ціну" }, { status: 400 });
  try {
    const { id } = await createErpProduct(b);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const stock = sp.get("stock");
  const [list, overview, statusCounts] = await Promise.all([
    listErpProducts({
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? "1"),
      perPage: Number(sp.get("perPage") ?? "50"),
      stock: stock === "in" || stock === "out" ? stock : "",
      status: sp.get("status") ?? "",
      categories: (sp.get("category") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      brands: (sp.get("brand") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      gender: sp.get("gender") ?? "",
      season: sp.get("season") ?? "",
    }),
    erpOverview(),
    erpStatusCounts(),
  ]);
  return NextResponse.json({ ...list, overview, statusCounts });
}

/** Bulk lifecycle change or price/brand/category edit from the list action bar. */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as {
    ids?: (string | number)[];
    status?: ErpStatus;
    brand?: string;
    category?: string;
    price_delta_pct?: number; // +N% or -N% on regular_price
    sale_pct?: number;        // set sale_price = regular_price * (1 - N/100)
  };
  if (!Array.isArray(b.ids) || !b.ids.length) return NextResponse.json({ error: "Не вибрано товарів" }, { status: 400 });
  const ids = b.ids.map(Number).filter(Number.isFinite);

  try {
    if (b.status) {
      const n = await bulkSetStatus(ids, b.status);
      return NextResponse.json({ ok: true, updated: n });
    }
    if (b.brand !== undefined || b.category !== undefined) {
      const sets: string[] = ["updated_at = now()"];
      const vals: unknown[] = [ids];
      if (b.brand !== undefined) { vals.push(b.brand); sets.push(`brand = $${vals.length}`); }
      if (b.category !== undefined) { vals.push(b.category); sets.push(`category = $${vals.length}`); }
      const { q: qFn } = await import("@/lib/pg");
      await qFn(`UPDATE products SET ${sets.join(", ")} WHERE id = ANY($1)`, vals);
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    if (b.price_delta_pct !== undefined) {
      const { q: qFn } = await import("@/lib/pg");
      const factor = 1 + b.price_delta_pct / 100;
      await qFn(
        `UPDATE products SET regular_price = ROUND(regular_price * $2, 0), price = ROUND(COALESCE(sale_price, regular_price) * $2, 0), updated_at = now() WHERE id = ANY($1)`,
        [ids, factor]
      );
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    if (b.sale_pct !== undefined) {
      const { q: qFn } = await import("@/lib/pg");
      const factor = 1 - b.sale_pct / 100;
      await qFn(
        `UPDATE products SET sale_price = ROUND(regular_price * $2, 0), price = ROUND(regular_price * $2, 0), updated_at = now() WHERE id = ANY($1)`,
        [ids, factor]
      );
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    return NextResponse.json({ error: "Не вказано дію" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
