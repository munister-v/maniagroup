import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/accountAuth";
import { AccountLoginForm } from "@/components/account/AccountLoginForm";
import Link from "next/link";

export const metadata = { title: "Вхід — Mania Group" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const account = await getSessionAccount();
  if (account) redirect("/account/profile");
  const { from } = await searchParams;
  return (
    <div className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <p className="text-center text-[11px] uppercase tracking-luxe text-muted">Mania Group</p>
        <h1 className="mt-3 text-center font-display text-3xl text-ink">Вхід до кабінету</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Немає акаунту?{" "}
          <Link href="/account/register" className="link-underline text-ink">
            Зареєструватись
          </Link>
        </p>
        <div className="mt-8">
          <AccountLoginForm redirectTo={from ?? "/account/profile"} />
        </div>
      </div>
    </div>
  );
}
