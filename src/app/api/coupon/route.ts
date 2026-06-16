import { NextResponse } from "next/server";
import { validateCoupon } from "@/lib/coupons";
import { readCartToken, getCart } from "@/lib/cart";

/** Validate a coupon against the caller's current cart subtotal. */
export async function POST(req: Request) {
  const { code } = (await req.json()) as { code: string };
  if (!code?.trim()) return NextResponse.json({ ok: false, error: "Введіть код" }, { status: 400 });

  const token = await readCartToken();
  const cart = token ? await getCart(token) : null;
  if (!cart || cart.items.length === 0) {
    return NextResponse.json({ ok: false, error: "Кошик порожній" }, { status: 400 });
  }

  const v = await validateCoupon(code, cart.subtotal);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  return NextResponse.json({ ok: true, code: v.code, discount: v.discount, type: v.type, value: v.value });
}
