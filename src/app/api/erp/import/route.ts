import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { parseImportSmart, parseImportWithTemplate, previewImport, applyImport, type ApplyResult, type ImportKind } from "@/lib/stockImport";
import { getMeta, setMeta } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getImportTemplate } from "@/lib/importTemplates";
import { recordSourceRun } from "@/lib/importSources";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type ImportHistoryEntry = {
  filename: string; kind: ImportKind; at: string;
  productsCreated: number; productsUpdated: number; variantsUpserted: number;
  stockMovements: number; matchedRows: number; unmatchedRows: number;
};

const HISTORY_KEY = "erp_import_history";
const HISTORY_MAX = 20;

async function recordHistory(filename: string, result: ApplyResult): Promise<void> {
  const entry: ImportHistoryEntry = {
    filename, kind: result.kind, at: new Date().toISOString(),
    productsCreated: result.productsCreated, productsUpdated: result.productsUpdated,
    variantsUpserted: result.variantsUpserted, stockMovements: result.stockMovements,
    matchedRows: result.matchedRows, unmatchedRows: result.unmatchedRows,
  };
  let prev: ImportHistoryEntry[] = [];
  try { prev = JSON.parse((await getMeta(HISTORY_KEY)) || "[]"); } catch {}
  await setMeta(HISTORY_KEY, JSON.stringify([entry, ...prev].slice(0, HISTORY_MAX)));
}

/** GET — last import sessions, with per-session created/updated/movements breakdown. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let history: ImportHistoryEntry[] = [];
  try { history = JSON.parse((await getMeta(HISTORY_KEY)) || "[]"); } catch {}
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
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });

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
  try {
    if (mode === "apply") {
      const result = await applyImport(parsed);
      await recordHistory(parsed.filename, result);
      await recordSourceRun(parsed.filename, tplIdStr, true, result.unmatchedRows).catch(() => {});
      const parts = [
        result.productsCreated ? `+${result.productsCreated} нових` : "",
        result.productsUpdated ? `${result.productsUpdated} оновлено` : "",
        result.stockMovements ? `${result.stockMovements} рухів` : "",
        result.unmatchedRows ? `${result.unmatchedRows} не знайдено` : "",
      ].filter(Boolean).join(" · ");
      await logActivity("import", `${parsed.filename} — ${parts || "без змін"}`, result.matchedRows);
      return NextResponse.json({ ok: true, mode, result, aiUsed });
    }
    const preview = await previewImport(parsed);
    return NextResponse.json({ ok: true, mode: "preview", preview: { ...preview, aiUsed } });
  } catch (e) {
    if (mode === "apply") await recordSourceRun(file.name, tplIdStr, false, 1).catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка обробки" }, { status: 500 });
  }
}
