import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Ready-to-fill example files, so the client sees the EXACT format expected
 * instead of guessing column names. Two kinds:
 *   master  → MG products table (.xlsx) — creates product cards
 *   offers  → ОСТАТКИ stock/price table (.csv, ';'-delimited) — updates stock
 * The example rows are filled with obvious dummy data the admin overwrites.
 */

const MASTER_HEADER = [
  "КОД", "АРТИКУЛ", "БРЕНД", "НАИМЕНОВАНИЕ", "Размеры со всех складов",
  "Цена базовая", "Цена продажи", "Состав", "Коллекция", "Тип", "Цвет", "Страна производитель",
];
const MASTER_ROWS = [
  ["10001", "ART-10001", "Mania Group", "Пальто вовняне", "S M M L", 4200, 3360, "80% вовна, 20% поліестер", "Осінь 2026", "Женская", "Чорний", "Туреччина"],
  ["10002", "ART-10002", "Mania Group", "Кросівки шкіряні", "41 42 42 43", 2800, 2800, "Натуральна шкіра", "Літо 2026", "Мужская", "Білий", "Італія"],
  ["10003", "ART-10003", "Mania Group", "Сукня міді", "XS S S M L", 1850, 1480, "95% віскоза, 5% еластан", "Весна 2026", "Женская", "Зелений", "Туреччина"],
];

const OFFERS_HEADER = ["external_Id", "factory_article", "barcode", "size", "offer_code", "quantity", "base_price", "discount_price"];
const OFFERS_ROWS = [
  ["ART-10001", "ART-10001", "4820000010011", "S", "mp000001", "2", "4200.00", "3360.00"],
  ["ART-10001", "ART-10001", "4820000010028", "M", "mp000002", "0", "4200.00", "3360.00"],
  ["ART-10002", "ART-10002", "4820000020011", "42", "mp000003", "5", "2800.00", "2800.00"],
];

// HTTP headers are ByteStrings — a cyrillic filename must be RFC 5987 encoded
// (filename*=UTF-8''…) with a plain-ASCII fallback for old clients.
function contentDisposition(asciiName: string, utf8Name: string): string {
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind");

  if (kind === "offers") {
    const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [OFFERS_HEADER, ...OFFERS_ROWS].map((row) => row.map((c) => esc(String(c))).join(";"));
    // BOM so Excel opens the cyrillic sizes/headers correctly.
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition("example-ostatki.csv", "ПРИКЛАД_ОСТАТКИ.csv"),
      },
    });
  }

  // default: master .xlsx
  const ws = XLSX.utils.aoa_to_sheet([MASTER_HEADER, ...MASTER_ROWS]);
  ws["!cols"] = MASTER_HEADER.map((h, i) => ({ wch: i === 3 ? 24 : i === 4 ? 20 : Math.max(10, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MG");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition("example-mg-products.xlsx", "ПРИКЛАД_MG_товари.xlsx"),
    },
  });
}
