import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * Ready-to-fill example file, so the client sees the EXACT format expected
 * instead of guessing column names — ОСТАТКИ stock/price table (.csv,
 * ';'-delimited). The example rows are filled with obvious dummy data the
 * admin overwrites.
 */

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
  void req;

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
