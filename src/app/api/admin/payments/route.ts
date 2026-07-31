import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getStoreSettings, saveStoreSettings } from "@/lib/settings";
import { monoTokenSource, testMonoToken, isMonoEnabled } from "@/lib/monobank";
import { SITE_URL } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

/** Токен назовні не віддаємо — тільки маску, як і ключ Нової Пошти. */
function mask(key: string): string {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await getStoreSettings();
  return NextResponse.json({
    enabled: s.monobank_enabled === "1",
    active: await isMonoEnabled(),
    tokenSource: await monoTokenSource(),
    tokenMasked: mask(s.monobank_token),
    webhookUrl: `${SITE_URL}/api/payments/monobank/webhook`,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};

  // Порожнє поле означає «лишити збережений токен», а не стерти його.
  if (typeof body.token === "string" && body.token.trim()) patch.monobank_token = body.token.trim();
  if (body.clear_token === true) patch.monobank_token = "";
  if (typeof body.enabled === "boolean") patch.monobank_enabled = body.enabled ? "1" : "";

  await saveStoreSettings(patch);
  return NextResponse.json({ ok: true });
}

/** Перевірка токена без збереження. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" && body.token.trim() ? body.token.trim() : undefined;
  return NextResponse.json(await testMonoToken(token));
}
