import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/accountAuth";
import { getOrdersForCustomer } from "@/lib/orders";

export async function GET(req: Request) {
  const account = await getSessionAccount();
  if (!account) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
  const orders = await getOrdersForCustomer(account.id, account.email, page);

  return NextResponse.json(
    orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      date_created: o.created_at,
      total: String(o.total),
      currency_symbol: "₴",
      ttn: o.ttn || null,
      tracking_url: o.tracking_url || null,
      shipping_city: o.shipping_city || null,
      shipping_branch: o.shipping_branch || null,
      payment_method: o.payment_method || null,
      line_items: o.items.map((it) => ({
        id: it.id,
        name: it.variation ? `${it.name} (${it.variation})` : it.name,
        quantity: it.quantity,
        total: String(it.line_total),
        image: it.image_src ? { src: it.image_src } : undefined,
      })),
    })),
  );
}
