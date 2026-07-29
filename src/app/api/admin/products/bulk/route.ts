import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { bulkProducts, bulkUpdateProducts, publishAllProducts, type BulkAction, type AdminProductInput } from "@/lib/products";
import { logActivity } from "@/lib/activity";

const MAX_BULK_IDS = 1_000;
const MAX_BULK_UPDATES = 300;

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
  const body = (await req.json().catch(() => null)) as { ids?: string[]; action?: BulkAction | "publish_all" } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }
  const { ids, action } = body;
  if (action === "publish_all") {
    try {
      const count = await publishAllProducts();
      await logActivity("save", `Опубліковано весь каталог без обмеження за фото — ${count} товарів`, count);
      return NextResponse.json({ ok: true, count, skipped: 0 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
    }
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "Не обрано товарів" }, { status: 400 });
  }
  if (!action || !(action in ACTION_LABEL)) {
    return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
  }
  if (ids.length > MAX_BULK_IDS) {
    return NextResponse.json({ error: `За раз можна обробити максимум ${MAX_BULK_IDS} товарів` }, { status: 413 });
  }
  try {
    const bulkAction = action as BulkAction;
    const { count, skipped } = await bulkProducts(ids, bulkAction);
    const summary = `Масова дія: ${ACTION_LABEL[bulkAction] ?? bulkAction} — ${count} товарів` + (skipped ? ` (${skipped} пропущено — ${SKIP_REASON[bulkAction] ?? "не підходять"})` : "");
    await logActivity(bulkAction === "delete" ? "delete" : "save", summary, count);
    return NextResponse.json({ ok: true, count, skipped });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

/** Spreadsheet bulk save: apply per-field edits to many products at once. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json().catch(() => null)) as { updates?: { id: string; fields: Partial<AdminProductInput> }[] } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некоректний JSON" }, { status: 400 });
  }
  const { updates } = body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }
  if (updates.length > MAX_BULK_UPDATES) {
    return NextResponse.json({ error: `За раз можна зберегти максимум ${MAX_BULK_UPDATES} рядків` }, { status: 413 });
  }
  try {
    const count = await bulkUpdateProducts(updates);
    await logActivity("save", `Таблиця: збережено правки в ${count} товарах`, count);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
