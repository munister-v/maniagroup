import { getSessionAccount } from "@/lib/accountAuth";
import { AccountDashboard } from "@/components/account/AccountDashboard";
import { redirect } from "next/navigation";

export const metadata = { title: "Мій кабінет — Mania Group" };

export default async function ProfilePage() {
  const account = await getSessionAccount();
  if (!account) redirect("/account/login");
  return <AccountDashboard initialAccount={account} initialTab="profile" />;
}
