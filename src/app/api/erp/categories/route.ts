import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const cats = await q(`SELECT *, (SELECT COUNT(*) FROM products WHERE category = c.name)::int AS product_count FROM categories c ORDER BY name`);
  return NextResponse.json(cats);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { name, slug, parent } = await req.json();
  const maxId = await q<{ nid: string }>("SELECT COALESCE(MAX(id),0)+1 AS nid FROM categories");
  const newId = Number(maxId[0].nid);
  const [row] = await q(
    `INSERT INTO categories (id, name, slug, parent) VALUES ($1, $2, $3, $4) RETURNING *`,
    [newId, name ?? "", slug ?? name?.toLowerCase().replace(/\s+/g, "-") ?? "", Number(parent ?? 0)]
  );
  return NextResponse.json({ ok: true, category: row });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id, name, slug, parent } = await req.json();
  await q(`UPDATE categories SET name=$2, slug=$3, parent=$4 WHERE id=$1`, [id, name ?? "", slug ?? "", Number(parent ?? 0)]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await req.json();
  // Move children to root
  await q(`UPDATE categories SET parent = 0 WHERE parent = $1`, [id]);
  await q(`DELETE FROM categories WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
