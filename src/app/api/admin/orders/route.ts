import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listOrders, updateOrderStatus, setOrderTracking, getOrder, type Order } from "@/lib/orders";
import { notifyStatusChange } from "@/lib/notify";

export function serializeOrder(o: Order) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    date_created: o.created_at,
    date_modified: o.updated_at,
    payment_method: o.payment_method,
    billing: {
      first_name: o.first_name,
      last_name: o.last_name,
      phone: o.phone,
      email: o.email,
    },
    shipping_city: o.shipping_city,
    shipping_branch: o.shipping_branch,
    comment: o.comment,
    ttn: o.ttn,
    tracking_url: o.tracking_url,
    source: o.source,
    coupon_code: o.coupon_code,
    discount: String(o.discount),
    subtotal: String(o.subtotal),
    shipping_cost: String(o.shipping_cost),
    line_items: o.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      name: it.variation ? `${it.name} (${it.variation})` : it.name,
      brand: it.brand,
      image_src: it.image_src,
      quantity: it.quantity,
      price: String(it.price),
      total: String(it.line_total),
    })),
    total: String(o.total),
    currency_symbol: "₴",
  };
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");
  const status = searchParams.get("status") ?? "";
  const perPage = Number(searchParams.get("per_page") ?? "20");
  const qParam = searchParams.get("q") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const { orders, total } = await listOrders({
    page, perPage,
    status: status || undefined,
    q: qParam || undefined,
    from: from || undefined,
    to: to || undefined,
    sortBy, sortDir,
  });

  return NextResponse.json({ total, orders: orders.map(serializeOrder) });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as { id: number; status?: string; ttn?: string };
  try {
    if (typeof body.ttn === "string") {
      await setOrderTracking(Number(body.id), body.ttn);
    } else if (body.status) {
      await updateOrderStatus(Number(body.id), body.status);
      const order = await getOrder(Number(body.id));
      if (order) await notifyStatusChange(order, body.status);
    } else {
      return NextResponse.json({ error: "Нічого оновлювати" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
