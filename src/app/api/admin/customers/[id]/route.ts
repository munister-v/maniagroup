import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getCustomer } from "@/lib/customers";
import { serializeOrder } from "../../orders/route";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const data = await getCustomer(Number(id));
  if (!data) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json({ customer: data.customer, orders: data.orders.map(serializeOrder) });
}
