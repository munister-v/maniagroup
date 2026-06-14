import { NextResponse } from "next/server";
import { addCartItem, getCart, updateCartItem } from "@/lib/wcCart";
import { readSessionCookie, writeSessionCookie } from "@/lib/sessionCookie";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Не вдалося оновити кошик";
}

export async function GET() {
  const session = await readSessionCookie();
  const { cart, sessionCookie } = await getCart(session);
  await writeSessionCookie(sessionCookie);
  return NextResponse.json(cart);
}

export async function POST(req: Request) {
  const { id, quantity } = (await req.json()) as { id: number; quantity?: number };
  const session = await readSessionCookie();
  try {
    const { cart, sessionCookie } = await addCartItem(session, id, quantity ?? 1);
    await writeSessionCookie(sessionCookie);
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

export async function PATCH(req: Request) {
  const { key, quantity } = (await req.json()) as { key: string; quantity: number };
  const session = await readSessionCookie();
  try {
    const { cart, sessionCookie } = await updateCartItem(session, key, quantity);
    await writeSessionCookie(sessionCookie);
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}
