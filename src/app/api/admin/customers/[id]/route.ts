import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getCustomer, setCustomerTags, addCustomerNote } from "@/lib/customers";
import { serializeOrder } from "../../orders/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const data = await getCustomer(Number(id));
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json({
    customer: data.customer,
    orders: data.orders.map(serializeOrder),
    tags: data.tags,
    notes: data.notes,
    segment: data.segment,
    avg_order: data.avg_order,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { tags } = (await req.json()) as { tags: string[] };
  await setCustomerTags(Number(id), Array.isArray(tags) ? tags : []);
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const { message } = (await req.json()) as { message: string };
  const text = (message ?? "").trim();
  if (!text) return NextResponse.json({ error: "Порожня нотатка" }, { status: 400 });
  const notes = await addCustomerNote(Number(id), text);
  return NextResponse.json({ ok: true, notes });
}
