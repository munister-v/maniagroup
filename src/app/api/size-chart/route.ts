import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "";
  const gender = req.nextUrl.searchParams.get("gender") ?? "";

  // Try to find chart: exact brand + gender match first, then brand-only, then all-brands
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
