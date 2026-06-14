import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/accountAuth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const account = await getSessionAccount();
  if (!account) redirect("/account/login");
  return <>{children}</>;
}
