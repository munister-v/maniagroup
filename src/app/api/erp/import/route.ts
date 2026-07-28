import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/adminAuth";
import { parseImportSmart, parseImportWithTemplate, previewImport, applyImport, type ImportKind, type StockImportMode } from "@/lib/stockImport";
import { logActivity } from "@/lib/activity";
import { getImportTemplate } from "@/lib/importTemplates";
import { getImportSource, recordSourceRun } from "@/lib/importSources";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type ImportHistoryEntry = {
  id: string; filename: string; kind: ImportKind; at: string;
  productsCreated: number; productsUpdated: number; variantsUpserted: number;
  stockMovements: number; matchedRows: number; unmatchedRows: number;
  stockMode: StockImportMode; zeroedRows: number; status: "applied" | "rolled_back";
  sourceName: string;
};

/** GET — last import sessions, with per-session created/updated/movements breakdown. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const history = await q<ImportHistoryEntry>(
    `SELECT id::text, filename, import_kind AS kind, created_at::text AS at,
            products_created AS "productsCreated", products_updated AS "productsUpdated",
            variants_upserted AS "variantsUpserted", stock_movements AS "stockMovements",
            matched_rows AS "matchedRows", unmatched_rows AS "unmatchedRows",
            stock_mode AS "stockMode", zeroed_rows AS "zeroedRows", status,
            source_name AS "sourceName"
       FROM inventory_import_runs ORDER BY created_at DESC LIMIT 30`,
  );
  return NextResponse.json({ history });
}

/**
 * "Завантажити товари" — upload a price/stock file (Intertop prices.csv,
 * or the odezda.xlsx / WooCommerce variable-export equivalent).
 * mode=preview (default) returns a dry-run summary; mode=apply writes the
 * changes. Multipart form: { file, mode }.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Очікується файл (multipart)" }, { status: 400 }); }

  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  const templateId = form.get("templateId");
  const sourceIdRaw = String(form.get("sourceId") ?? "").trim();
  const sourceId = sourceIdRaw ? Number(sourceIdRaw) : null;
  const stockMode = String(form.get("stockMode") ?? "patch") as StockImportMode;
  const updateStock = String(form.get("updateStock") ?? "true") !== "false";
  const updatePrices = String(form.get("updatePrices") ?? "true") !== "false";
  const createMissingProducts = String(form.get("createMissingProducts") ?? "true") !== "false";
  const blankQuantity = String(form.get("blankQuantity") ?? "ignore") === "zero" ? "zero" : "ignore";
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });
  if (!(["patch", "snapshot"] as string[]).includes(stockMode)) return NextResponse.json({ error: "Некоректний режим залишків" }, { status: 400 });
  if (stockMode === "snapshot" && !sourceId) return NextResponse.json({ error: "Для повного знімка виберіть джерело даних" }, { status: 400 });
  if (stockMode === "snapshot" && !updateStock) return NextResponse.json({ error: "Повний знімок потребує оновлення залишків" }, { status: 400 });
  if (!updateStock && !updatePrices) return NextResponse.json({ error: "Виберіть залишки, ціни або обидва поля" }, { status: 400 });
  const source = sourceId ? await getImportSource(String(sourceId)) : null;
  if (sourceId && !source) return NextResponse.json({ error: "Джерело даних не знайдено" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let parsed: import("@/lib/stockImport").Parsed & { ai?: boolean };
  try {
    if (templateId) {
      const tpl = await getImportTemplate(String(templateId));
      if (!tpl) return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 400 });
      parsed = await parseImportWithTemplate(buf, file.name, tpl);
    } else {
      parsed = await parseImportSmart(buf, file.name);
    }
  }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося прочитати файл" }, { status: 400 }); }

  if (parsed.kind === "unknown")
    return NextResponse.json({ error: "Не вдалося розпізнати формат — навіть за допомогою ШІ. Перевірте, що у файлі є колонки розміру/ціни/залишку або код товару." }, { status: 400 });

  const aiUsed = !!parsed.ai;
  const tplIdStr = templateId ? String(templateId) : null;
  const importOptions = {
    stockMode, sourceId, sourceName: source?.name ?? parsed.filename,
    updateStock, updatePrices, createMissingProducts, blankQuantity,
  } as const;
  try {
    if (mode === "apply") {
      const result = await applyImport(parsed, importOptions);
      const parts = [
        result.productsCreated ? `+${result.productsCreated} нових` : "",
        result.productsUpdated ? `${result.productsUpdated} оновлено` : "",
        result.stockMovements ? `${result.stockMovements} рухів` : "",
        result.zeroedRows ? `${result.zeroedRows} обнулено` : "",
        result.unmatchedRows ? `${result.unmatchedRows} не знайдено` : "",
      ].filter(Boolean).join(" · ");
      const summary = parts || "без змін";
      await recordSourceRun(source?.name ?? parsed.filename, tplIdStr, true, result.unmatchedRows, summary).catch(() => {});
      await logActivity("import", `${parsed.filename} — ${summary}`, result.matchedRows);
      revalidatePath("/");
      revalidatePath("/catalog");
      revalidatePath("/product/[slug]", "page");
      return NextResponse.json({ ok: true, mode, result, aiUsed });
    }
    const preview = await previewImport(parsed, importOptions);
    return NextResponse.json({ ok: true, mode: "preview", preview: { ...preview, aiUsed } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка обробки";
    if (mode === "apply") await recordSourceRun(source?.name ?? file.name, tplIdStr, false, 1, msg.slice(0, 200)).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
