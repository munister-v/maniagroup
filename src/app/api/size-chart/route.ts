import { NextRequest, NextResponse } from "next/server";
import { q, q1 } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const brand = req.nextUrl.searchParams.get("brand") ?? "";
  const gender = req.nextUrl.searchParams.get("gender") ?? "";

  // Intertop 2.10 guide: a product explicitly bound to a chart by code takes
  // priority — the brand+gender best-match below is only a fallback for
  // products that predate this binding or were never given one.
  if (code) {
    const byCode = await q1(`SELECT * FROM size_charts WHERE code = $1 LIMIT 1`, [code]);
    if (byCode) return NextResponse.json(byCode);
  }

  const charts = await q(
    `SELECT * FROM size_charts
     ORDER BY
       CASE WHEN brand = $1 AND gender = $2 THEN 0
            WHEN brand = $1 AND gender = '' THEN 1
            WHEN brand = '' AND gender = $2 THEN 2
            WHEN brand = '' AND gender = '' THEN 3
            ELSE 4 END,
       id DESC
     LIMIT 1`,
    [brand, gender]
  );

  if (!charts.length) return NextResponse.json(null);
  return NextResponse.json(charts[0]);
}
