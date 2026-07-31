import { NextResponse } from "next/server";
import { getInvoiceStatus, verifyWebhook, mapPaymentStatus, type MonoStatus } from "@/lib/monobank";
import { setPaymentStatus, getOrder } from "@/lib/orders";
import { notifyPaymentReceived } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Вебхук монобанку про зміну статусу оплати.
 *
 * Три рівні недовіри до вхідного запиту, бо цей роут відкритий у світ:
 *   1. підпис ECDSA по СИРОМУ тілу (тому читаємо text(), а не json());
 *   2. навіть із валідним підписом перепитуємо статус у банку — тіло запиту
 *      ніколи не є джерелом правди про гроші;
 *   3. reference (наш orderId) звіряємо з рахунком, щоб чужий рахунок не міг
 *      позначити оплаченим наше замовлення.
 *
 * Повторні доставки нешкідливі: payments має унікальний (provider, ref), а
 * setPaymentStatus не змінює нічого, якщо статус той самий.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  const signed = await verifyWebhook(raw, req.headers.get("x-sign"));
  if (!signed) {
    console.warn("[monobank] webhook with bad signature rejected");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { invoiceId?: string; reference?: string; status?: MonoStatus };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.invoiceId) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    // Джерело правди — банк, а не тіло запиту.
    const invoice = await getInvoiceStatus(body.invoiceId);
    const orderId = Number(invoice.reference || body.reference || 0);
    if (!orderId) {
      console.warn("[monobank] webhook without usable reference:", body.invoiceId);
      return NextResponse.json({ ok: true });
    }

    const order = await getOrder(orderId);
    if (!order) {
      console.warn("[monobank] webhook for unknown order:", orderId);
      return NextResponse.json({ ok: true });
    }

    const status = mapPaymentStatus(invoice.status);
    const wasPaid = order.payment_status === "paid";

    await setPaymentStatus(orderId, status, {
      author: "monobank",
      payment: {
        provider: "monobank",
        ref: invoice.invoiceId,
        amount: invoice.amount / 100,
        currency: "UAH",
        payload: invoice as unknown,
      },
    });

    // Сповіщаємо один раз — у момент переходу в «оплачено».
    if (status === "paid" && !wasPaid) {
      const fresh = await getOrder(orderId);
      if (fresh) await notifyPaymentReceived(fresh);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // 500 змусить монобанк повторити доставку — це те, що нам треба при
    // тимчасовому збої БД чи мережі.
    console.error("[monobank] webhook handling failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
