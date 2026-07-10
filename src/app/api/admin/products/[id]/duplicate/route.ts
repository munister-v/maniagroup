import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { duplicateAdminProduct } from "@/lib/products";
import { logActivity } from "@/lib/activity";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  try {
    const { id: newId } = await duplicateAdminProduct(id);
    logActivity("save", `Скопійовано товар #${id} → #${newId}`, 1, "admin", newId);
    return NextResponse.json({ ok: true, id: newId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 500 });
  }
}
