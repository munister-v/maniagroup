import { NextResponse } from "next/server";
import { clearCart, placeOrder, type Address } from "@/lib/wcCart";
import { readSessionCookie, writeSessionCookie } from "@/lib/sessionCookie";

export async function POST(req: Request) {
  const { billing, note } = (await req.json()) as { billing: Address; note?: string };
  const session = await readSessionCookie();

  const result = await placeOrder(session, billing, note);

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  // WC does not auto-empty the cart on a COD Store-API checkout — clear it
  const clearedCookie = await clearCart(result.sessionCookie).catch(() => result.sessionCookie);

  await writeSessionCookie(clearedCookie ?? result.sessionCookie);

  return NextResponse.json({ ok: true, orderId: result.orderId, status: result.status });
}
