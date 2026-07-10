import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getValueList, updateValueList, deleteValueList, type ValueListInput } from "@/lib/valueLists";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const l = await getValueList(id);
  if (!l) return NextResponse.json({ error: "Список не знайдено" }, { status: 404 });
  return NextResponse.json({ list: l });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as ValueListInput;
  if (!body?.name?.trim()) return NextResponse.json({ error: "Вкажіть назву списку" }, { status: 400 });
  try {
    await updateValueList(id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  await deleteValueList(id);
  return NextResponse.json({ ok: true });
}
