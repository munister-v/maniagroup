import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getImportTemplate, updateImportTemplate, deleteImportTemplate, type ImportTemplateInput } from "@/lib/importTemplates";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const t = await getImportTemplate(id);
  if (!t) return NextResponse.json({ error: "Шаблон не знайдено" }, { status: 404 });
  return NextResponse.json({ template: t });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as ImportTemplateInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву шаблону" }, { status: 400 });
  try {
    await updateImportTemplate(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  await deleteImportTemplate(id);
  return NextResponse.json({ ok: true });
}
