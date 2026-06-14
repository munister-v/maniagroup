import { cookies } from "next/headers";

// First-party cookie that stores the WooCommerce guest session token so the
// cart survives reloads and browser restarts on the same device.
export const WC_SESSION_COOKIE = "mg_wc_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function readSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(WC_SESSION_COOKIE)?.value;
}

export async function writeSessionCookie(value?: string): Promise<void> {
  if (!value) return;
  const jar = await cookies();
  jar.set(WC_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}
