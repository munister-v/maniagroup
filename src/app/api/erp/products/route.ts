import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listErpProducts, erpOverview, createErpProduct, type ErpProductInput } from "@/lib/erp";

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
  const [list, overview] = await Promise.all([
    listErpProducts({
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? "1"),
      stock: stock === "in" || stock === "out" ? stock : "",
    }),
    erpOverview(),
  ]);
  return NextResponse.json({ ...list, overview });
}
