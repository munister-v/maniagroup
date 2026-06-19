import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findAccountByEmail, verifyPassword, createSession } from "@/lib/accountsDb";

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe = true } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Введіть email та пароль" }, { status: 400 });
    }
    const account = await findAccountByEmail(email);
    if (!account || !verifyPassword(password, account.password_hash)) {
      return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
    }
    // rememberMe=true → 30 days; false → session cookie (expires on browser close)
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : undefined;
    const token = await createSession(account.id);
    const jar = await cookies();
    jar.set("mg_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      ...(maxAge ? { maxAge } : {}),
    });
    return NextResponse.json({ ok: true, account: { id: account.id, email: account.email, first_name: account.first_name, last_name: account.last_name } });
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
