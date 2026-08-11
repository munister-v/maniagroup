import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/accountAuth";
import { AccountLoginForm } from "@/components/account/AccountLoginForm";
import { AuthShell } from "@/components/account/AuthShell";
import Link from "next/link";

export const metadata = { title: "Вхід" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const account = await getSessionAccount();
  if (account) redirect("/account/profile");
  const { from } = await searchParams;
  return (
    <AuthShell
      eyebrow="Особистий кабінет"
      title="Вхід"
      caption="Замовлення, обране та збережені дані доставки в одному місці."
      footer={
        // Посилання на реєстрацію було двічі: тут і всередині форми. Лишаємо
        // один раз і внизу, після дії, заради якої людина прийшла.
        <p className="text-[13px] text-muted">
          Ще немає акаунту?{" "}
          <Link href="/account/register" className="link-underline text-ink">
            Зареєструватись
          </Link>
        </p>
      }
    >
      <AccountLoginForm redirectTo={from ?? "/account/profile"} />
    </AuthShell>
  );
}
