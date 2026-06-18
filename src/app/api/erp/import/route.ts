import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { parseImportSmart, previewImport, applyImport } from "@/lib/stockImport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * "Завантажити товари" — upload a price/stock file (Intertop prices.csv or MG
 * master .xls). mode=preview (default) returns a dry-run summary; mode=apply
 * writes the changes. Multipart form: { file, mode }.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Очікується файл (multipart)" }, { status: 400 }); }

  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let parsed;
  try { parsed = await parseImportSmart(buf, file.name); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося прочитати файл" }, { status: 400 }); }

  if (parsed.kind === "unknown")
    return NextResponse.json({ error: "Не вдалося розпізнати формат — навіть за допомогою ШІ. Перевірте, що у файлі є колонки розміру/ціни/залишку або код товару." }, { status: 400 });

  const aiUsed = !!parsed.ai;
  try {
    if (mode === "apply") {
      const result = await applyImport(parsed);
      return NextResponse.json({ ok: true, mode, result, aiUsed });
    }
    const preview = await previewImport(parsed);
    return NextResponse.json({ ok: true, mode: "preview", preview: { ...preview, aiUsed } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка обробки" }, { status: 500 });
  }
}
