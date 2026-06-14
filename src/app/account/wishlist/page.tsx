import { getSessionAccount } from "@/lib/accountAuth";
import { AccountDashboard } from "@/components/account/AccountDashboard";
import { redirect } from "next/navigation";
import { getWishlist } from "@/lib/accountsDb";

export const metadata = { title: "Список бажань — Mania Group" };

export default async function WishlistPage() {
  const account = await getSessionAccount();
  if (!account) redirect("/account/login");
  const wishlist = await getWishlist(account.id);
  return <AccountDashboard initialAccount={account} initialTab="wishlist" initialWishlist={wishlist} />;
}
