import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findAccountByEmail, verifyPassword, createSession } from "@/lib/accountsDb";
import { checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from "@/lib/adminAuth";
import { baseCookie } from "@/lib/cookieOptions";
import { clientIp } from "@/lib/clientIp";

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe = true } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Введіть email та пароль" }, { status: 400 });
    }

    // Same Postgres-backed limiter the admin login uses; the "acct:" prefix
    // keeps customer attempts in their own bucket so one does not lock the other.
    const key = `acct:${clientIp(req)}`;
    const limit = await checkLoginRateLimit(key);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Забагато невдалих спроб. Спробуйте через ${Math.ceil(limit.retryAfterSec / 60)} хв.` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
      );
    }

    const account = await findAccountByEmail(email);
    if (!account || !verifyPassword(password, account.password_hash)) {
      await recordFailedLogin(key);
      return NextResponse.json({ error: "Невірний email або пароль" }, { status: 401 });
    }
    await clearLoginAttempts(key);
    // rememberMe=true → 30 days; false → session cookie (expires on browser close)
    const maxAge = rememberMe ? 30 * 24 * 60 * 60 : undefined;
    const token = await createSession(account.id);
    const jar = await cookies();
    jar.set("mg_session", token, { ...baseCookie, ...(maxAge ? { maxAge } : {}) });
    return NextResponse.json({ ok: true, account: { id: account.id, email: account.email, first_name: account.first_name, last_name: account.last_name } });
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
