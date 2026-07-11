import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { verifySmtp } from "@/lib/mailer";

/** Verifies whatever SMTP settings are currently saved in the DB (no override
 *  param exists in lib/mailer.ts, unlike sendTelegram) — the admin UI saves
 *  the form first, then calls this, same as the AI-key test does. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  try {
    await verifySmtp();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
