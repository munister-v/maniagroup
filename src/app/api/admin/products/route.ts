import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listAdminProducts, createAdminProduct, parseFilterParams, type AdminProductInput } from "@/lib/products";
import { logActivity } from "@/lib/activity";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = searchParams.get("perPage") ? Number(searchParams.get("perPage")) : undefined;
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDirParam = searchParams.get("sortDir");
  const sortDir = sortDirParam === "asc" || sortDirParam === "desc" ? sortDirParam : undefined;
  const { products, total } = await listAdminProducts({
    ...parseFilterParams(searchParams),
    page,
    perPage,
    sortBy,
    sortDir,
  });
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
    logActivity("save", `Створено товар «${body.name}»`, 1, "admin", id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
