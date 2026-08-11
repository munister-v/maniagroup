import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/accountAuth";
import { AccountRegisterForm } from "@/components/account/AccountRegisterForm";
import { AuthShell } from "@/components/account/AuthShell";
import Link from "next/link";

export const metadata = { title: "Реєстрація" };

export default async function RegisterPage() {
  const account = await getSessionAccount();
  if (account) redirect("/account/profile");
  return (
    <AuthShell
      image="/images/cat-men-editorial-ss26.webp"
      eyebrow="Особистий кабінет"
      title="Створити акаунт"
      caption="Щоб не вводити дані доставки щоразу і бачити історію замовлень."
      footer={
        <p className="text-[13px] text-muted">
          Вже є акаунт?{" "}
          <Link href="/account/login" className="link-underline text-ink">
            Увійти
          </Link>
        </p>
      }
    >
      <AccountRegisterForm />
    </AuthShell>
  );
}
