import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/accountAuth";
import { getWishlist } from "@/lib/accountsDb";

export async function GET() {
  const account = await getSessionAccount();
  if (!account) return NextResponse.json({ account: null });
  const wishlist = await getWishlist(account.id);
  return NextResponse.json({ account, wishlist });
}
