import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getImportSource, updateImportSource, deleteImportSource, type ImportSourceInput } from "@/lib/importSources";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const s = await getImportSource(id);
  if (!s) return NextResponse.json({ error: "Джерело не знайдено" }, { status: 404 });
  return NextResponse.json({ source: s });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as ImportSourceInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву джерела" }, { status: 400 });
  try {
    await updateImportSource(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  await deleteImportSource(id);
  return NextResponse.json({ ok: true });
}
