import nodemailer from "nodemailer";

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/** Build a fresh transporter from DB settings (env fallback). Called per-send so DB changes apply without restart. */
async function getTransporter() {
  const { getStoreSettings } = await import("./settings");
  const s = await getStoreSettings();

  const host = s.smtp_host || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(s.smtp_port || process.env.SMTP_PORT || 587);
  const user = s.smtp_user || process.env.SMTP_USER || "";
  const pass = s.smtp_pass || process.env.SMTP_PASS || "";
  const from =
    s.smtp_from || process.env.SMTP_FROM || user || "noreply@maniagroup.com.ua";

  if (!user || !pass)
    throw new Error(
      "SMTP не налаштовано: вкажіть логін і пароль у ERP → Шаблони листів → Налаштування SMTP",
    );

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return { transporter, from };
}

/** Verify SMTP connection (used by config UI). */
export async function verifySmtp(): Promise<void> {
  const { transporter } = await getTransporter();
  await transporter.verify();
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const { transporter, from } = await getTransporter();
  await transporter.sendMail({ from, ...opts });
}

export async function sendTemplateEmail(
  templateSlug: string,
  to: string,
  vars: Record<string, string>,
): Promise<void> {
  const { q } = await import("./pg");
  const [tpl] = await q<{ subject: string; body: string }>(
    "SELECT subject, body FROM email_templates WHERE slug = $1",
    [templateSlug],
  );
  if (!tpl) throw new Error(`Template not found: ${templateSlug}`);
  await sendEmail({
    to,
    subject: renderTemplate(tpl.subject, vars),
    text: renderTemplate(tpl.body, vars),
  });
}
