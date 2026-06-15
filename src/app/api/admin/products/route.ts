import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listAdminProducts, createAdminProduct, type AdminProductInput } from "@/lib/products";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const stockParam = searchParams.get("stock");
  const stock = stockParam === "in" || stockParam === "out" ? stockParam : undefined;
  const { products, total } = await listAdminProducts({ q, page, stock });
  return NextResponse.json({ products, total });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as AdminProductInput;
  if (!body.name || body.regular_price === undefined) {
    return NextResponse.json({ error: "Вкажіть назву та ціну" }, { status: 400 });
  }
  try {
    const { id } = await createAdminProduct(body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
