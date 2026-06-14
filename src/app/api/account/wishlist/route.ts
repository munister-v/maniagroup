import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/accountAuth";
import { getWishlist, toggleWishlist } from "@/lib/accountsDb";

export async function GET() {
  const account = await getSessionAccount();
  if (!account) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await getWishlist(account.id) });
}

export async function POST(req: Request) {
  const account = await getSessionAccount();
  if (!account) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { product_id } = await req.json();
  if (!product_id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  const added = await toggleWishlist(account.id, String(product_id));
  return NextResponse.json({ ok: true, added, items: await getWishlist(account.id) });
}
