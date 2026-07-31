import { cookies } from "next/headers";
import crypto from "crypto";
import { getSetting, setSetting } from "./settings";
import { hashPassword, verifyPassword } from "./accountsDb";
import { q, q1 } from "./pg";
import { baseCookie } from "./cookieOptions";

const COOKIE_NAME = "mg_admin";
// ⚠️ Пароль за замовчуванням лишається ТІЛЬКИ для локальної розробки. Репозиторій
// публічний, тож у production цей рядок знав би кожен, хто його відкрив: там
// пароль обов'язково береться з ADMIN_PASSWORD або з хешу в store_settings, а
// якщо нема ні того, ні іншого — вхід просто не працює (краще, ніж відомий пароль).
const DEV_FALLBACK_PASSWORD = "maniagroup2026";
const PASSWORD =
  process.env.ADMIN_PASSWORD ??
  (process.env.NODE_ENV === "production" ? "" : DEV_FALLBACK_PASSWORD);
const SECRET = process.env.ADMIN_SECRET ?? "mg-admin-secret-change-me";

if (SECRET === "mg-admin-secret-change-me") {
  // The session token is a deterministic HMAC of a public string — anyone who
  // reads this source and finds ADMIN_SECRET unset can compute a valid admin
  // cookie themselves, without ever knowing the password. Loud and repeated
  // on purpose: this must be visible in `pm2 logs`, not just a one-line
  // warning buried at boot.
  console.error(
    "\n⚠️  ADMIN_SECRET is not set — using the public default value.\n" +
    "   Anyone who reads the source can forge a valid admin session cookie\n" +
    "   without knowing the password. Set ADMIN_SECRET in .env.local to a\n" +
    "   random value (e.g. `openssl rand -hex 32`) and restart.\n",
  );
}

// Session token is independent of the password so that changing the password
// does not require re-deriving cookies for validation. (Login still requires
// the password; changing it simply means new logins use the new password.)
function token(): string {
  return crypto.createHmac("sha256", SECRET).update("mg-admin-session-v1").digest("hex");
}

/* ── login rate limiting (Postgres-backed — see admin_login_attempts in pg.ts,
   shared across PM2's 2 cluster workers, unlike an in-memory counter) ── */

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number };

export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const row = await q1<{ locked_until: string | null }>(
    "SELECT locked_until FROM admin_login_attempts WHERE ip = $1", [ip],
  );
  if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const retryAfterSec = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true };
}

/** Record a failed attempt; locks the IP out once it crosses MAX_ATTEMPTS within WINDOW_MINUTES. */
export async function recordFailedLogin(ip: string): Promise<void> {
  await q(
    `INSERT INTO admin_login_attempts (ip, count, first_attempt, locked_until)
     VALUES ($1, 1, now(), NULL)
     ON CONFLICT (ip) DO UPDATE SET
       count = CASE
         WHEN admin_login_attempts.first_attempt < now() - INTERVAL '${WINDOW_MINUTES} minutes' THEN 1
         ELSE admin_login_attempts.count + 1
       END,
       first_attempt = CASE
         WHEN admin_login_attempts.first_attempt < now() - INTERVAL '${WINDOW_MINUTES} minutes' THEN now()
         ELSE admin_login_attempts.first_attempt
       END,
       locked_until = CASE
         WHEN admin_login_attempts.first_attempt < now() - INTERVAL '${WINDOW_MINUTES} minutes' THEN NULL
         WHEN admin_login_attempts.count + 1 >= ${MAX_ATTEMPTS} THEN now() + INTERVAL '${LOCKOUT_MINUTES} minutes'
         ELSE admin_login_attempts.locked_until
       END`,
    [ip],
  );
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  await q("DELETE FROM admin_login_attempts WHERE ip = $1", [ip]);
}

/**
 * Verify a password. If an override hash has been set in store_settings
 * (admin changed the password from the panel), check against it; otherwise
 * fall back to the ADMIN_PASSWORD env value.
 */
export async function checkPassword(input: string): Promise<boolean> {
  const hash = await getSetting("admin_password_hash").catch(() => null);
  if (hash) return verifyPassword(input, hash);
  // Порожній PASSWORD = у production не налаштовано жодного пароля. Без цієї
  // перевірки порожній ввід збігся б із порожнім паролем і пустив би всередину.
  if (!PASSWORD) return false;
  return input === PASSWORD;
}

export async function setAdminPassword(newPassword: string): Promise<void> {
  await setSetting("admin_password_hash", hashPassword(newPassword));
}

const SESSION_DAYS = 7;
const REMEMBERED_DAYS = 60;

/**
 * @param remember true — кука живе REMEMBERED_DAYS; false — сесійна кука, яка
 * зникає із закриттям браузера. Для спільного чи чужого комп'ютера друге
 * безпечніше, тому за замовчуванням «запам'ятати» вимкнено.
 */
export async function setAdminSession(remember = false) {
  const jar = await cookies();
  const maxAge = 60 * 60 * 24 * (remember ? REMEMBERED_DAYS : SESSION_DAYS);
  jar.set(COOKIE_NAME, token(), { ...baseCookie, maxAge });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value === token();
}
