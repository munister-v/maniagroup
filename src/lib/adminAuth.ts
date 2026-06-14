import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "mg_admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "maniagroup2026";
const SECRET = process.env.ADMIN_SECRET ?? "mg-admin-secret-change-me";

function token(): string {
  return crypto.createHmac("sha256", SECRET).update(PASSWORD).digest("hex");
}

export function checkPassword(input: string): boolean {
  return input === PASSWORD;
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
