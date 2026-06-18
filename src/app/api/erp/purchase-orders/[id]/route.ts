import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import {
  getPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  addPoItem, updatePoItem, deletePoItem,
  sendPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder,
} from "@/lib/purchasing";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await getPurchaseOrder(Number(id));
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(data);
}

/** Actions on a PO: edit meta, add/update/remove a line, send, receive, cancel. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  const b = await req.json() as {
    action: "meta" | "addItem" | "updateItem" | "deleteItem" | "send" | "receive" | "cancel";
    supplier_id?: number | null; expected_at?: string; note?: string;
    variantId?: number; qty?: number; unitCost?: number; itemId?: number; doc_date?: string;
  };
  try {
    if (b.action === "meta") await updatePurchaseOrder(pid, { supplier_id: b.supplier_id, expected_at: b.expected_at, note: b.note });
    else if (b.action === "addItem") await addPoItem(pid, { variantId: Number(b.variantId), qty: Number(b.qty) || 0, unitCost: Number(b.unitCost) || 0 });
    else if (b.action === "updateItem") await updatePoItem(Number(b.itemId), { qty: b.qty, unitCost: b.unitCost });
    else if (b.action === "deleteItem") await deletePoItem(Number(b.itemId));
    else if (b.action === "send") await sendPurchaseOrder(pid);
    else if (b.action === "cancel") await cancelPurchaseOrder(pid);
    else if (b.action === "receive") {
      const r = await receivePurchaseOrder(pid, { doc_date: b.doc_date });
      const data = await getPurchaseOrder(pid);
      return NextResponse.json({ ok: true, receiptId: r.receiptId, ...data });
    } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
  const data = await getPurchaseOrder(pid);
  return NextResponse.json({ ok: true, ...data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deletePurchaseOrder(Number(id));
  return NextResponse.json({ ok: true });
}
