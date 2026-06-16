import { NextResponse } from "next/server";
import { readCartToken } from "@/lib/cart";
import { createOrder, getOrder } from "@/lib/orders";
import { notifyNewOrder } from "@/lib/notify";
import { getSessionAccount } from "@/lib/accountAuth";

type CheckoutBody = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  branch: string;
  note?: string;
  payment_method?: "cod" | "prepay";
};

export async function POST(req: Request) {
  const body = (await req.json()) as CheckoutBody;
  const token = await readCartToken();
  if (!token) {
    return NextResponse.json({ ok: false, message: "Кошик порожній" }, { status: 400 });
  }

  if (!body.first_name || !body.phone || !body.city || !body.branch) {
    return NextResponse.json({ ok: false, message: "Заповніть обовʼязкові поля" }, { status: 400 });
  }

  const account = await getSessionAccount();

  try {
    const { id, number } = await createOrder({
      cartToken: token,
      accountId: account?.id ?? null,
      email: body.email,
      phone: body.phone,
      firstName: body.first_name,
      lastName: body.last_name,
      shippingCity: body.city,
      shippingBranch: body.branch,
      comment: body.note,
      paymentMethod: body.payment_method ?? "cod",
    });
    const order = await getOrder(id);
    if (order) await notifyNewOrder(order);
    return NextResponse.json({ ok: true, orderId: id, number, status: "pending" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Не вдалося оформити замовлення" },
      { status: 400 },
    );
  }
}
