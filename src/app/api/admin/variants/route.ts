import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listAdminVariants, createVariants, type NewVariantInput } from "@/lib/variants";
import { logActivity } from "@/lib/activity";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const { variants, total } = await listAdminVariants({
    q: searchParams.get("q") ?? undefined,
    active: searchParams.get("active") ?? undefined,
    inStock: searchParams.get("inStock") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    siteStatus: searchParams.get("siteStatus") ?? undefined,
    productId: searchParams.get("productId") ?? undefined,
    page: Number(searchParams.get("page") ?? "1"),
    perPage: searchParams.get("perPage") ? Number(searchParams.get("perPage")) : undefined,
  });
  return NextResponse.json({ variants, total });
}

/**
 * «Створити торгову пропозицію» / «Генератор торгових пропозицій» (guide
 * 2.1 §6) — one call covers both: a single-size create and a bulk create
 * across every picked size share this same body shape ({ productId, items }).
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { productId?: number | string; items?: NewVariantInput[] };
  const productId = Number(body.productId);
  if (!Number.isFinite(productId)) return NextResponse.json({ error: "Не вказано товар" }, { status: 400 });
  if (!Array.isArray(body.items) || body.items.length === 0) return NextResponse.json({ error: "Вкажіть хоча б один розмір" }, { status: 400 });
  for (const it of body.items) {
    if (!it.size?.trim()) return NextResponse.json({ error: "Розмір обов'язковий" }, { status: 400 });
    if (!(it.price > 0)) return NextResponse.json({ error: "Ціна обов'язкова" }, { status: 400 });
  }
  const { created, skippedExisting } = await createVariants(productId, body.items);
  if (created > 0) {
    logActivity("save", `Створено торгових пропозицій: ${created}${skippedExisting ? ` (${skippedExisting} вже існували)` : ""}`, created, "admin", productId);
  }
  return NextResponse.json({ ok: true, created, skippedExisting });
}
