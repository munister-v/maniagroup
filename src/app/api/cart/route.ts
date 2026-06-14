import { NextResponse } from "next/server";
import { addItem, getCart, updateItem, ensureCartToken, readCartToken } from "@/lib/cart";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Не вдалося оновити кошик";
}

export async function GET() {
  const token = await readCartToken();
  return NextResponse.json(await getCart(token));
}

export async function POST(req: Request) {
  const { product_id, variation, quantity } = (await req.json()) as {
    product_id: string;
    variation?: string;
    quantity?: number;
  };
  try {
    const token = await ensureCartToken();
    const cart = await addItem(token, String(product_id), variation ?? "", quantity ?? 1);
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}

export async function PATCH(req: Request) {
  const { key, quantity } = (await req.json()) as { key: string; quantity: number };
  try {
    const token = await readCartToken();
    if (!token) return NextResponse.json({ items: [], items_count: 0, subtotal: 0 });
    const cart = await updateItem(token, key, quantity);
    return NextResponse.json(cart);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 409 });
  }
}
