import { cookies } from "next/headers";
import { getAccountBySession, type Account } from "./accountsDb";

const COOKIE = "mg_session";

export async function getSessionAccount(): Promise<Account | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return getAccountBySession(token);
}

export function SESSION_COOKIE_NAME() { return COOKIE; }
