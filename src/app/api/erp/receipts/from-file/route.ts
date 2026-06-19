import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { previewReceiptFromFile, createReceiptFromFile, type ReceiptCostCol } from "@/lib/receiptImport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * D3 — Прихід з файлу. Multipart: { file, mode, costCol, supplierId, note }.
 * mode=preview (default) → dry-run summary; mode=apply → creates a DRAFT receipt
 * (user reviews and posts it in ERP → Прихід).
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Очікується файл (multipart)" }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не надіслано" }, { status: 400 });

  const mode = String(form.get("mode") ?? "preview");
  const costCol = (String(form.get("costCol") ?? "base") === "discount" ? "discount" : "base") as ReceiptCostCol;
  const supplierIdRaw = form.get("supplierId");
  const supplierId = supplierIdRaw ? Number(supplierIdRaw) : null;
  const note = form.get("note") ? String(form.get("note")) : undefined;

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (mode === "apply") {
      const result = await createReceiptFromFile(buf, file.name, { costCol, supplierId, note });
      if (!result.receiptId) {
        return NextResponse.json({ error: "Жодної позиції не зіставлено з каталогом" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, mode, ...result });
    }
    const preview = await previewReceiptFromFile(buf, file.name, costCol);
    if (preview.kind === "unknown") {
      return NextResponse.json({ error: "Не вдалося розпізнати формат файлу" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mode: "preview", preview });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка обробки" }, { status: 500 });
  }
}
