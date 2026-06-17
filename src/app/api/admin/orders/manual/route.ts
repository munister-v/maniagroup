import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { createManualOrder, getOrder, type ManualOrderInput } from "@/lib/orders";
import { notifyNewOrder, notifyLowStockForOrder } from "@/lib/notify";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as ManualOrderInput;
  if (!body.firstName?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: "Вкажіть ім'я та телефон клієнта" }, { status: 400 });
  }
  try {
    const res = await createManualOrder({
      accountId: body.accountId ?? null,
      email: body.email ?? "",
      phone: body.phone,
      firstName: body.firstName,
      lastName: body.lastName ?? "",
      shippingCity: body.shippingCity ?? "",
      shippingBranch: body.shippingBranch ?? "",
      comment: body.comment ?? "",
      paymentMethod: body.paymentMethod ?? "cod",
      items: body.items ?? [],
    });
    const order = await getOrder(res.id);
    if (order) await notifyNewOrder(order);
    await notifyLowStockForOrder(res.id);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
