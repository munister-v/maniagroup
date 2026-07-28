import { isAdmin } from "@/lib/adminAuth";
import { exportAdminProducts, parseFilterParams } from "@/lib/products";
import { logActivity } from "@/lib/activity";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

/**
 * Multi-format catalog export. Respects the grid filters (q, stock, brand,
 * category, gender, color, season, price, status) or an explicit id list, and
 * an optional `cols` whitelist. Formats: xlsx | csv | json | pdf.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "xlsx").toLowerCase();
  const idsParam = searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const colsParam = searchParams.get("cols");
  const cols = colsParam ? colsParam.split(",").map((c) => c.trim()).filter(Boolean) : null;

  const rows = await exportAdminProducts({ ...parseFilterParams(searchParams), ids });
  logActivity("export", `Каталог → ${format.toUpperCase()} (${rows.length} товарів)`, rows.length);

  // Flatten to localized, ordered columns for human-friendly spreadsheets.
  const ALL: Record<string, (r: typeof rows[number]) => string | number> = {
    "ID": (r) => r.id,
    "SKU": (r) => r.sku ?? "",
    "Назва": (r) => r.name ?? "",
    "Бренд": (r) => r.brand ?? "",
    "Категорія": (r) => r.category ?? "",
    "Стать": (r) => (r.gender === "men" ? "Чоловіче" : r.gender === "women" ? "Жіноче" : ""),
    "Ціна": (r) => r.regular_price ?? 0,
    "Акційна": (r) => r.sale_price ?? "",
    "Підсумкова": (r) => r.price ?? 0,
    "В наявності": (r) => (r.is_in_stock ? "Так" : "Ні"),
    "Статус": (r) => (r.status === "publish" ? "Опубліковано" : "Чернетка"),
    "Колір": (r) => r.color ?? "",
    "Сезон": (r) => r.season ?? "",
    "Склад": (r) => r.composition ?? "",
    "Країна": (r) => r.country ?? "",
    "Матеріал": (r) => r.material ?? "",
    "Підвид": (r) => r.subtype ?? "",
    "Розміри": (r) => r.sizes ?? "",
    "Slug": (r) => r.slug ?? "",
    "Фото": (r) => r.image_src ?? "",
  };
  const colNames = cols && cols.length ? cols.filter((c) => c in ALL) : Object.keys(ALL);
  const localized = rows.map((r) => {
    const o: Record<string, string | number> = {};
    for (const c of colNames) o[c] = ALL[c](r);
    return o;
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return new Response(JSON.stringify(localized, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.json"`,
      },
    });
  }

  if (format === "pdf") {
    const pdf = await buildPdf(localized, colNames, stamp);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.pdf"`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(localized);

  if (format === "csv") {
    const csv = "﻿" + XLSX.utils.sheet_to_csv(ws); // BOM so Excel reads UTF-8
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.csv"`,
      },
    });
  }

  // Default: real .xlsx — width per selected column (name/photo wider).
  const WIDTH: Record<string, number> = {
    "ID": 10, "SKU": 16, "Назва": 40, "Бренд": 18, "Категорія": 18, "Стать": 10,
    "Ціна": 10, "Акційна": 10, "Підсумкова": 12, "В наявності": 12, "Статус": 14,
    "Колір": 14, "Сезон": 12, "Склад": 24, "Країна": 14, "Розміри": 16, "Slug": 22, "Фото": 40,
  };
  ws["!cols"] = colNames.map((c) => ({ wch: WIDTH[c] ?? 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Каталог");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="maniagroup-catalog-${stamp}.xlsx"`,
    },
  });
}

async function buildPdf(rows: Record<string, string | number>[], cols: string[], stamp: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;

  const fontPath = path.join(process.cwd(), "public", "fonts", "Arial.ttf");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.existsSync(fontPath) ? fs.readFileSync(fontPath) : null;
  const font = fontBytes ? await pdfDoc.embedFont(fontBytes) : await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  const boldFont = font;

  const landscape = cols.length > 6;
  const pageSize: [number, number] = landscape ? [842, 595] : [595, 842];
  const margin = 28;
  let page = pdfDoc.addPage(pageSize);
  const pageWidth = page.getWidth() - margin * 2;
  const safeCols = cols.slice(0, 10);
  const widths = columnWidths(safeCols, pageWidth);
  let y = page.getHeight() - margin;
  let pageNo = 1;
  const pages: ReturnType<typeof pdfDoc.addPage>[] = [page];
  const textColor = rgb(0.12, 0.15, 0.2);
  const muted = rgb(0.42, 0.47, 0.52);
  const line = rgb(0.86, 0.89, 0.9);

  drawHeader();
  for (const row of rows) {
    const wrapped = safeCols.map((col, i) => wrapText(String(row[col] ?? ""), widths[i] - 8, 7.5, font).slice(0, 5));
    const rowHeight = Math.max(23, Math.min(70, Math.max(...wrapped.map((lines) => lines.length)) * 9 + 10));
    if (y - rowHeight < margin + 18) {
      page = pdfDoc.addPage(pageSize);
      pages.push(page);
      pageNo += 1;
      y = page.getHeight() - margin;
      drawHeader();
    }
    let x = margin;
    safeCols.forEach((col, i) => {
      page.drawRectangle({ x, y: y - rowHeight, width: widths[i], height: rowHeight, borderColor: line, borderWidth: 0.4 });
      wrapped[i].forEach((text, idx) => {
        page.drawText(text, { x: x + 4, y: y - 12 - idx * 9, size: 7.5, font, color: textColor });
      });
      x += widths[i];
    });
    y -= rowHeight;
  }

  pages.forEach((p, index) => {
    p.drawText(`Mania Group · ${stamp} · ${index + 1}/${pages.length}`, {
      x: margin,
      y: 14,
      size: 7,
      font,
      color: muted,
    });
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);

  function drawHeader() {
    page.drawText("Каталог Mania Group", { x: margin, y, size: 15, font: boldFont, color: rgb(0.17, 0.18, 0.26) });
    y -= 18;
    const note = `${rows.length.toLocaleString("uk-UA")} позицій · ${new Date().toLocaleString("uk-UA")} · ${cols.length > safeCols.length ? `PDF: перші ${safeCols.length} колонок, повний набір у XLSX` : "обрані колонки"}`;
    page.drawText(note, { x: margin, y, size: 8.5, font, color: muted });
    y -= 18;
    let x = margin;
    safeCols.forEach((col, i) => {
      page.drawRectangle({
        x,
        y: y - 16,
        width: widths[i],
        height: 16,
        color: rgb(0.93, 0.95, 0.96),
        borderColor: rgb(0.83, 0.86, 0.88),
        borderWidth: 0.4,
      });
      page.drawText(fitText(col.toUpperCase(), widths[i] - 8, 6.8, boldFont), {
        x: x + 4,
        y: y - 11,
        size: 6.8,
        font: boldFont,
        color: rgb(0.17, 0.18, 0.26),
      });
      x += widths[i];
    });
    y -= 16;
  }
}

function wrapText(text: string, maxWidth: number, size: number, font: { widthOfTextAtSize: (s: string, n: number) => number }): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [""];
  const words = cleaned.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = fitText(word, maxWidth, size, font);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(text: string, maxWidth: number, size: number, font: { widthOfTextAtSize: (s: string, n: number) => number }): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function columnWidths(cols: string[], total: number): number[] {
  const weights = cols.map((col) => {
    if (col === "Назва" || col === "Фото") return 2.4;
    if (col === "Склад" || col === "Розміри") return 1.7;
    if (col === "ID" || col === "Ціна" || col === "Акційна") return 0.8;
    return 1.1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.max(42, Math.floor((total * w) / sum)));
}
