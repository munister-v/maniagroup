import { cookies } from "next/headers";
import crypto from "crypto";
import { getSetting, setSetting } from "./settings";
import { hashPassword, verifyPassword } from "./accountsDb";

const COOKIE_NAME = "mg_admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "maniagroup2026";
const SECRET = process.env.ADMIN_SECRET ?? "mg-admin-secret-change-me";

// Session token is independent of the password so that changing the password
// does not require re-deriving cookies for validation. (Login still requires
// the password; changing it simply means new logins use the new password.)
function token(): string {
  return crypto.createHmac("sha256", SECRET).update("mg-admin-session-v1").digest("hex");
}

/**
 * Verify a password. If an override hash has been set in store_settings
 * (admin changed the password from the panel), check against it; otherwise
 * fall back to the ADMIN_PASSWORD env value.
 */
export async function checkPassword(input: string): Promise<boolean> {
  const hash = await getSetting("admin_password_hash").catch(() => null);
  if (hash) return verifyPassword(input, hash);
  return input === PASSWORD;
}

export async function setAdminPassword(newPassword: string): Promise<void> {
  await setSetting("admin_password_hash", hashPassword(newPassword));
}

export async function setAdminSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value === token();
}
