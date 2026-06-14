import { getSessionAccount } from "@/lib/accountAuth";
import { AccountDashboard } from "@/components/account/AccountDashboard";
import { redirect } from "next/navigation";

export const metadata = { title: "Мої замовлення — Mania Group" };

export default async function OrdersPage() {
  const account = await getSessionAccount();
  if (!account) redirect("/account/login");
  return <AccountDashboard initialAccount={account} initialTab="orders" />;
}
