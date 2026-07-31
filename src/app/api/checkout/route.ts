import { NextResponse } from "next/server";
import { readCartToken } from "@/lib/cart";
import { createOrder, getOrder } from "@/lib/orders";
import { notifyNewOrder, notifyLowStockForOrder } from "@/lib/notify";
import { getSessionAccount } from "@/lib/accountAuth";
import { createInvoice, isMonoEnabled } from "@/lib/monobank";
import { setPaymentStatus } from "@/lib/orders";

type CheckoutBody = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  branch: string;
  note?: string;
  payment_method?: "cod" | "prepay" | "card";
  coupon_code?: string;
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
      couponCode: body.coupon_code,
    });
    const order = await getOrder(id);
    if (order) await notifyNewOrder(order);
    await notifyLowStockForOrder(id);

    // Оплата карткою: створюємо рахунок і віддаємо посилання на сторінку
    // монобанку. Замовлення вже існує — якщо оплата не пройде, воно просто
    // лишиться неоплаченим, а не зникне.
    let paymentUrl: string | null = null;
    if (body.payment_method === "card" && order && (await isMonoEnabled())) {
      try {
        const invoice = await createInvoice({
          orderId: id,
          orderNumber: number,
          amount: Number(order.total),
          basket: order.items.map((i) => ({
            name: i.name,
            qty: i.quantity,
            sum: Number(i.price) * i.quantity,
            code: String(i.product_id),
          })),
        });
        paymentUrl = invoice.pageUrl;
        await setPaymentStatus(id, "pending", {
          author: "monobank",
          payment: {
            provider: "monobank",
            ref: invoice.invoiceId,
            amount: Number(order.total),
            payload: { pageUrl: invoice.pageUrl },
          },
        });
      } catch (e) {
        // Не валимо оформлення через збій банку: замовлення прийнято,
        // покупця просто не веде на оплату — менеджер зв'яжеться.
        console.error("[checkout] monobank invoice failed:", e);
      }
    }

    return NextResponse.json({ ok: true, orderId: id, number, status: "pending", paymentUrl });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Не вдалося оформити замовлення" },
      { status: 400 },
    );
  }
}
