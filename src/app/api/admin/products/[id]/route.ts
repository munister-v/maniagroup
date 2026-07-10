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
  const body = (await req.json()) as Partial<AdminProductInput> & { statusTransitionLabel?: string };
  const { statusTransitionLabel, ...patch } = body;
  try {
    await updateAdminProduct(id, patch);
    // A moderation-workflow transition (Intertop 2.1 guide's «Історія статусів»)
    // gets its own distinct log entry instead of the generic save message, so
    // the history tab can show real status transitions, not every field edit.
    if (statusTransitionLabel) {
      logActivity("status", statusTransitionLabel, 1, "admin", id);
    } else {
      logActivity("save", `Оновлено картку товару${body.name ? ` «${body.name}»` : ` #${id}`}`, 1, "admin", id);
    }
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
    // Guide 2.7's ever_published guard is a validation rejection, not a
    // server fault — 400 so the client's toast reads it as expected input.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
