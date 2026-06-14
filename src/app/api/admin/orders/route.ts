import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listOrders, updateOrderStatus } from "@/lib/orders";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const status = searchParams.get("status") ?? "";
  const perPage = Number(searchParams.get("per_page") ?? "20");

  const { orders } = await listOrders({ page, perPage, status: status || undefined });

  return NextResponse.json(
    orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      date_created: o.created_at,
      billing: {
        first_name: o.first_name,
        last_name: o.last_name,
        phone: o.phone,
        email: o.email,
      },
      shipping_city: o.shipping_city,
      shipping_branch: o.shipping_branch,
      comment: o.comment,
      line_items: o.items.map((it) => ({
        id: it.id,
        name: it.variation ? `${it.name} (${it.variation})` : it.name,
        quantity: it.quantity,
        total: String(it.line_total),
      })),
      total: String(o.total),
      currency_symbol: "₴",
    })),
  );
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id, status } = (await req.json()) as { id: number; status: string };
  try {
    await updateOrderStatus(Number(id), status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
