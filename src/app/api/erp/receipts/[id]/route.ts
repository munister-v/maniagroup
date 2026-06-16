import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  getReceipt, updateReceipt, deleteReceipt, postReceipt,
  addReceiptItem, updateReceiptItem, deleteReceiptItem,
} from "@/lib/receiving";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await getReceipt(Number(id));
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(data);
}

/** Actions on a receipt: edit meta, add/update/remove a line, or post it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rid = Number(id);
  const b = await req.json() as {
    action: "meta" | "addItem" | "updateItem" | "deleteItem" | "post";
    supplier?: string; doc_date?: string; note?: string;
    variantId?: number; qty?: number; unitCost?: number; itemId?: number;
  };
  try {
    if (b.action === "meta") await updateReceipt(rid, { supplier: b.supplier, doc_date: b.doc_date, note: b.note });
    else if (b.action === "addItem") await addReceiptItem(rid, { variantId: Number(b.variantId), qty: Number(b.qty) || 0, unitCost: Number(b.unitCost) || 0 });
    else if (b.action === "updateItem") await updateReceiptItem(Number(b.itemId), { qty: b.qty, unitCost: b.unitCost });
    else if (b.action === "deleteItem") await deleteReceiptItem(Number(b.itemId));
    else if (b.action === "post") await postReceipt(rid);
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
  const data = await getReceipt(rid);
  return NextResponse.json({ ok: true, ...data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteReceipt(Number(id));
  return NextResponse.json({ ok: true });
}
