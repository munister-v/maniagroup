import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkUpdateVariants, updateVariantsIndividually, type VariantPatch } from "@/lib/variants";
import { logActivity } from "@/lib/activity";

const MAX_VARIANT_UPDATES = 500;
const MAX_VARIANT_IDS = 2_000;

/** Per-row save (Intertop's inline «Торгові пропозиції» edit-row — one
 *  product's variants, each with its own price/stock/active). */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json().catch(() => null)) as { updates?: { id: string; patch: VariantPatch }[]; productId?: string } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }
  const { updates, productId } = body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }
  if (updates.length > MAX_VARIANT_UPDATES) {
    return NextResponse.json({ error: `За раз можна зберегти максимум ${MAX_VARIANT_UPDATES} пропозицій` }, { status: 413 });
  }
  try {
    const count = await updateVariantsIndividually(updates);
    await logActivity("save", `Оновлено торгові пропозиції — ${count} шт.`, count, "admin", productId);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ids?: string[]; patch?: VariantPatch } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }
  const { ids, patch } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Не обрано пропозицій" }, { status: 400 });
  }
  if (ids.length > MAX_VARIANT_IDS) {
    return NextResponse.json({ error: `За раз можна обробити максимум ${MAX_VARIANT_IDS} пропозицій` }, { status: 413 });
  }
  if (!patch || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }
  try {
    const count = await bulkUpdateVariants(ids, patch);
    const parts: string[] = [];
    if (patch.stock_qty !== undefined) parts.push(`залишок=${patch.stock_qty}`);
    if (patch.price !== undefined) parts.push(`ціна=${patch.price ?? "—"}`);
    if (patch.sale_price !== undefined) parts.push(`акція=${patch.sale_price ?? "—"}`);
    if (patch.active !== undefined) parts.push(patch.active ? "активовано" : "деактивовано");
    await logActivity("save", `Пропозиції: ${parts.join(", ")} — ${count} шт.`, count);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
