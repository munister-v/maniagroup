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
    }),
    erpOverview(),
    erpStatusCounts(),
  ]);
  return NextResponse.json({ ...list, overview, statusCounts });
}

/** Bulk lifecycle change from the list action bar (Активувати / На модерацію / …). */
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json() as { ids?: (string | number)[]; status?: ErpStatus };
  if (!Array.isArray(b.ids) || !b.ids.length) return NextResponse.json({ error: "Не вибрано товарів" }, { status: 400 });
  if (!b.status) return NextResponse.json({ error: "Не вказано статус" }, { status: 400 });
  try {
    const n = await bulkSetStatus(b.ids, b.status);
    return NextResponse.json({ ok: true, updated: n });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
