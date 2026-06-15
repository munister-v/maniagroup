import { NextResponse } from "next/server";
import { isAdmin, checkPassword, setAdminPassword } from "@/lib/adminAuth";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { current, next } = (await req.json()) as { current: string; next: string };

  if (!(await checkPassword(current))) {
    return NextResponse.json({ error: "Поточний пароль невірний" }, { status: 400 });
  }
  if (!next || next.length < 6) {
    return NextResponse.json({ error: "Новий пароль мінімум 6 символів" }, { status: 400 });
  }
  await setAdminPassword(next);
  return NextResponse.json({ ok: true });
}
