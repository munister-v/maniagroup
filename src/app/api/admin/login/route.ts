import { NextResponse } from "next/server";
import { checkPassword, setAdminSession, checkLoginRateLimit, recordFailedLogin, clearLoginAttempts } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activity";
import { clientIp } from "@/lib/clientIp";

export async function POST(req: Request) {
  const ip = clientIp(req);

  const limit = await checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: `Забагато невдалих спроб. Спробуйте ще раз через ${Math.ceil(limit.retryAfterSec / 60)} хв.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { password, remember = false } = (await req.json()) as { password: string; remember?: boolean };
  if (!(await checkPassword(password))) {
    await recordFailedLogin(ip);
    logActivity("login_fail", `Невдалий вхід з IP ${ip}`, undefined, ip);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await clearLoginAttempts(ip);
  await setAdminSession(remember);
  logActivity("login", `Вхід в адмін-панель з IP ${ip}`, undefined, ip);
  return NextResponse.json({ ok: true });
}
