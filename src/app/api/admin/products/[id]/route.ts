import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getAdminProduct, updateAdminProduct, deleteAdminProduct, type AdminProductInput } from "@/lib/products";
import { logActivity } from "@/lib/activity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as Partial<AdminProductInput>;
  try {
    await updateAdminProduct(id, body);
    logActivity("save", `Оновлено картку товару${body.name ? ` «${body.name}»` : ` #${id}`}`, 1, "admin", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  try {
    await deleteAdminProduct(id);
    logActivity("delete", `Видалено товар #${id}`, 1, "admin", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
