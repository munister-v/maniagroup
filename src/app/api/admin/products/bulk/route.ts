import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkProducts, bulkUpdateProducts, type BulkAction, type AdminProductInput } from "@/lib/products";
import { logActivity } from "@/lib/activity";

const ACTION_LABEL: Record<string, string> = {
  publish: "опубліковано", unpublish: "сховано", in_stock: "в наявності",
  out_of_stock: "немає в наявності", feature: "в обране", unfeature: "з обраного",
  show_without_photo: "показано на сайті без фото", hide_without_photo: "знято показ без фото", delete: "видалено",
  archive: "заархівовано",
};

// Why a skipped row didn't get processed — differs per action (guide 2.7:
// archive only touches «На сайті» rows; delete only touches never-published
// ones; the stock toggles skip anything with real size variants).
const SKIP_REASON: Record<string, string> = {
  in_stock: "керуються розмірами", out_of_stock: "керуються розмірами",
  archive: "не в статусі «На сайті»", delete: "вже були на сайті — див. архівацію",
};

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { ids, action } = (await req.json()) as { ids: string[]; action: BulkAction };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Не обрано товарів" }, { status: 400 });
  }
  try {
    const { count, skipped } = await bulkProducts(ids, action);
    const summary = `Масова дія: ${ACTION_LABEL[action] ?? action} — ${count} товарів` + (skipped ? ` (${skipped} пропущено — ${SKIP_REASON[action] ?? "не підходять"})` : "");
    await logActivity(action === "delete" ? "delete" : "save", summary, count);
    return NextResponse.json({ ok: true, count, skipped });
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
    await logActivity("save", `Таблиця: збережено правки в ${count} товарах`, count);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
