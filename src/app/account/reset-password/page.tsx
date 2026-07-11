import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { ResetPasswordForm } from "@/components/account/ResetPasswordForm";
import { getValidResetToken } from "@/lib/accountsDb";

export const metadata = { title: "Новий пароль — Mania Group" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await getValidResetToken(token) : null;

  return (
    <div className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <Reveal className="w-full max-w-sm">
        <div className="border border-line bg-white px-6 py-10 sm:px-10">
          <p className="text-center text-[11px] uppercase tracking-luxe text-muted">Mania Group</p>
          <h1 className="mt-3 text-center font-display text-3xl text-ink">Новий пароль</h1>

          {valid && token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="mt-8 text-center">
              <p className="text-sm text-muted">
                Посилання для відновлення паролю недійсне або застаріло — запросіть нове.
              </p>
              <Link
                href="/account/forgot-password"
                className="mt-6 inline-flex h-11 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
              >
                Запросити нове посилання
              </Link>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
