import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/accountAuth";
import { AccountRegisterForm } from "@/components/account/AccountRegisterForm";
import Link from "next/link";

export const metadata = { title: "Реєстрація — Mania Group" };

export default async function RegisterPage() {
  const account = await getSessionAccount();
  if (account) redirect("/account/profile");
  return (
    <div className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <p className="text-center text-[11px] uppercase tracking-luxe text-muted">Mania Group</p>
        <h1 className="mt-3 text-center font-display text-3xl text-ink">Створити акаунт</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Вже є акаунт?{" "}
          <Link href="/account/login" className="link-underline text-ink">
            Увійти
          </Link>
        </p>
        <div className="mt-8">
          <AccountRegisterForm />
        </div>
      </div>
    </div>
  );
}
