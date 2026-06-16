import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkProducts, bulkUpdateProducts, type BulkAction, type AdminProductInput } from "@/lib/products";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { ids, action } = (await req.json()) as { ids: string[]; action: BulkAction };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Не обрано товарів" }, { status: 400 });
  }
  try {
    const count = await bulkProducts(ids, action);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

/** Spreadsheet bulk save: apply per-field edits to many products at once. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { updates } = (await req.json()) as { updates: { id: string; fields: Partial<AdminProductInput> }[] };
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }
  try {
    const count = await bulkUpdateProducts(updates);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
