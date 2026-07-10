import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkUpdateVariants, updateVariantsIndividually, type VariantPatch } from "@/lib/variants";
import { logActivity } from "@/lib/activity";

/** Per-row save (Intertop's inline «Торгові пропозиції» edit-row — one
 *  product's variants, each with its own price/stock/active). */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { updates, productId } = (await req.json()) as { updates: { id: string; patch: VariantPatch }[]; productId?: string };
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
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
  const { ids, patch } = (await req.json()) as { ids: string[]; patch: VariantPatch };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Не обрано пропозицій" }, { status: 400 });
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
