import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { sendTelegram } from "@/lib/notify";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { token?: string; chatId?: string };
  const res = await sendTelegram(
    "✅ <b>Mania Group</b>\nСповіщення Telegram налаштовано правильно.",
    { token: body.token, chatId: body.chatId },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
