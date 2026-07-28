import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * Ready-to-fill examples, so the admin sees formats that match the actual
 * Mania Group tables instead of a cryptic stock-feed-only CSV. Excel is the
 * default because it keeps barcodes/SKUs as text instead of converting them to
 * scientific notation.
 */

const FULL_HEADER = [
  "SKU", "Назва (укр.)", "Назва (рос.)", "Бренд", "Категорія", "Стать",
  "Заводський артикул", "Штрихкод", "Розмір", "Код оферу",
  "Кількість", "Базова ціна", "Акційна ціна", "Колір", "Сезон",
  "Матеріал верху", "Країна", "Склад (укр.)", "Опис (укр.)",
];
const FULL_ROWS = [
  [
    "900000880", "Плавальні шорти чоловічі", "Плав.шорты мужские HARMONT&BLAINE",
    "HARMONT&BLAINE", "Плавальні", "Чоловіче", "YRN095090280_099", "4820000010011",
    "L", "mp000001", "2", "7140.00", "5712.00", "Червоний", "Літо",
    "Бавовна", "Італія", "100% бавовна", "Легкі чоловічі шорти для пляжу та відпочинку.",
  ],
  [
    "900000880", "Плавальні шорти чоловічі", "Плав.шорты мужские HARMONT&BLAINE",
    "HARMONT&BLAINE", "Плавальні", "Чоловіче", "YRN095090280_099", "4820000010028",
    "XL", "mp000002", "0", "7140.00", "5712.00", "Червоний", "Літо",
    "Бавовна", "Італія", "100% бавовна", "Той самий товар, інший розмір.",
  ],
  [
    "900000881", "Джинси чоловічі", "Джинсы мужские HARMONT&BLAINE",
    "HARMONT&BLAINE", "Джинси", "Чоловіче", "WRM001059482B97_804", "4820000020011",
    "32", "mp000003", "5", "10080.00", "7056.00", "Синій", "Демісезон",
    "Денім", "Італія", "98% бавовна, 2% еластан", "Базова модель джинсів для каталогу.",
  ],
];

const STOCK_HEADER = ["SKU", "Заводський артикул", "Штрихкод", "Розмір", "Код оферу", "Кількість", "Базова ціна", "Акційна ціна"];
const STOCK_ROWS = FULL_ROWS.map((row) => [row[0], row[6], row[7], row[8], row[9], row[10], row[11], row[12]]);

const TEXT_COLUMNS = new Set(["SKU", "Заводський артикул", "Штрихкод", "Розмір", "Код оферу"]);

// HTTP headers are ByteStrings — a cyrillic filename must be RFC 5987 encoded
// (filename*=UTF-8''…) with a plain-ASCII fallback for old clients.
function contentDisposition(asciiName: string, utf8Name: string): string {
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

function asCsv(header: string[], rows: string[][]) {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + [header, ...rows].map((row) => row.map((c) => esc(String(c))).join(";")).join("\r\n");
}

function asXlsx(header: string[], rows: string[][], sheetName: string) {
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  header.forEach((name, index) => {
    if (!TEXT_COLUMNS.has(name)) return;
    for (let row = 2; row <= rows.length + 1; row += 1) {
      const ref = XLSX.utils.encode_cell({ r: row - 1, c: index });
      if (sheet[ref]) sheet[ref].t = "s";
    }
  });
  sheet["!cols"] = header.map((name) => ({ wch: Math.max(12, Math.min(28, name.length + 6)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") === "stock" || req.nextUrl.searchParams.get("kind") === "offers" ? "stock" : "full";
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const header = type === "stock" ? STOCK_HEADER : FULL_HEADER;
  const rows = type === "stock" ? STOCK_ROWS : FULL_ROWS;
  const base = type === "stock" ? ["example-stock", "ПРИКЛАД_ЗАЛИШКИ_ЦІНИ", "Залишки_ціни"] : ["example-products", "ПРИКЛАД_ТОВАРИ", "Товари"];

  if (format === "csv") {
    return new Response(asCsv(header, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${base[0]}.csv`, `${base[1]}.csv`),
      },
    });
  }

  const xlsx = asXlsx(header, rows, base[2]);
  const body = xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(`${base[0]}.xlsx`, `${base[1]}.xlsx`),
    },
  });
}
