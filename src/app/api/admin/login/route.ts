import { NextResponse } from "next/server";
import { checkPassword, setAdminSession, checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activity";

/** Client IP behind nginx: x-forwarded-for is a comma-separated list, first = original client. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  const limit = await checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Забагато невдалих спроб. Спробуйте ще раз через ${Math.ceil(limit.retryAfterSec / 60)} хв.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { password } = (await req.json()) as { password: string };
  if (!(await checkPassword(password))) {
    await recordFailedLogin(ip);
    logActivity("login_fail", `Невдалий вхід з IP ${ip}`, undefined, ip);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await clearLoginAttempts(ip);
  await setAdminSession();
  logActivity("login", `Вхід в адмін-панель з IP ${ip}`, undefined, ip);
  return NextResponse.json({ ok: true });
}
