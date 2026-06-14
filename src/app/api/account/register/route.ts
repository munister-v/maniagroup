import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAccount, createSession, findAccountByEmail } from "@/lib/accountsDb";

export async function POST(req: Request) {
  try {
    const { email, password, first_name, last_name, phone } = await req.json();
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
    }
    const existing = await findAccountByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Цей email вже зареєстровано" }, { status: 409 });
    }
    const account = await createAccount(email, password, first_name ?? "", last_name ?? "", phone ?? "");
    const token = await createSession(account.id);
    const jar = await cookies();
    jar.set("mg_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return NextResponse.json({ ok: true, account: { id: account.id, email: account.email, first_name: account.first_name, last_name: account.last_name } });
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
