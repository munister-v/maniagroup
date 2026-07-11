import { NextResponse } from "next/server";
import { findAccountByEmail, createPasswordResetToken } from "@/lib/accountsDb";
import { sendTemplateEmail } from "@/lib/mailer";
import { sendTelegram } from "@/lib/notify";

/**
 * Always responds { ok: true } regardless of whether the email exists or the
 * send actually succeeded — this is the same anti-enumeration behavior the
 * old stub already had (see account/forgot-password/page.tsx), just now
 * backed by a real token instead of a fake setTimeout.
 */
export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (email) {
    const account = await findAccountByEmail(email);
    if (account) {
      const token = await createPasswordResetToken(account.id);
      const resetUrl = `${new URL(req.url).origin}/account/reset-password?token=${token}`;
      try {
        await sendTemplateEmail("password_reset", account.email, {
          name: account.first_name || "клієнте",
          reset_url: resetUrl,
        });
      } catch (e) {
        // SMTP likely not configured yet — surface it to the admin instead of
        // silently losing the request (see the Email/SMTP settings card).
        await sendTelegram(
          `⚠️ Не вдалося надіслати лист відновлення паролю для ${account.email}: ${e instanceof Error ? e.message : "помилка"}`,
        ).catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true });
}
