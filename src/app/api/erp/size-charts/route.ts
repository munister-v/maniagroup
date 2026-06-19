import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const charts = await q(`SELECT * FROM size_charts ORDER BY brand, name`);
  return NextResponse.json(charts);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { brand, name, gender, chart } = await req.json();
  const [row] = await q(
    `INSERT INTO size_charts (brand, name, gender, chart) VALUES ($1, $2, $3, $4) RETURNING *`,
    [brand ?? "", name ?? "", gender ?? "", JSON.stringify(chart ?? [])]
  );
  return NextResponse.json({ ok: true, chart: row });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id, brand, name, gender, chart } = await req.json();
  await q(
    `UPDATE size_charts SET brand = $2, name = $3, gender = $4, chart = $5 WHERE id = $1`,
    [id, brand ?? "", name ?? "", gender ?? "", JSON.stringify(chart ?? [])]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await req.json();
  await q(`DELETE FROM size_charts WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
