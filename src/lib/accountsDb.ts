import crypto from "crypto";
import { q, q1 } from "./pg";

/* ── Password hashing (Node built-in scrypt, no native deps) ── */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

/* ── Session ── */

export async function createSession(accountId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await q("INSERT INTO sessions (token, account_id, expires_at) VALUES ($1, $2, $3)", [token, accountId, expires]);
  return token;
}

export type Account = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
};

export async function getAccountBySession(token: string): Promise<Account | null> {
  if (!token) return null;
  return q1<Account>(
    `SELECT a.id, a.email, a.first_name, a.last_name, a.phone, a.created_at
     FROM accounts a JOIN sessions s ON s.account_id = a.id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
}

export async function deleteSession(token: string): Promise<void> {
  await q("DELETE FROM sessions WHERE token = $1", [token]);
}

/* ── Account CRUD ── */

export async function createAccount(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  phone: string,
): Promise<Account> {
  const hashed = hashPassword(password);
  const row = await q1<Account>(
    `INSERT INTO accounts (email, password_hash, first_name, last_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, first_name, last_name, phone, created_at`,
    [email.toLowerCase().trim(), hashed, firstName, lastName, phone],
  );
  return row!;
}

export async function findAccountByEmail(email: string): Promise<(Account & { password_hash: string }) | null> {
  return q1<Account & { password_hash: string }>(
    "SELECT id, email, password_hash, first_name, last_name, phone, created_at FROM accounts WHERE lower(email) = lower($1)",
    [email.trim()],
  );
}

export async function updateAccount(
  id: number,
  data: Partial<Pick<Account, "first_name" | "last_name" | "phone" | "email">>,
): Promise<void> {
  const keys = Object.keys(data);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const vals = [...Object.values(data), id];
  await q(`UPDATE accounts SET ${sets} WHERE id = $${keys.length + 1}`, vals);
}

export async function updatePassword(id: number, newPassword: string): Promise<void> {
  await q("UPDATE accounts SET password_hash = $1 WHERE id = $2", [hashPassword(newPassword), id]);
}

/* ── Wishlist ── */

export async function getWishlist(accountId: number): Promise<string[]> {
  const rows = await q<{ product_id: string }>(
    "SELECT product_id::text AS product_id FROM wishlist WHERE account_id = $1 ORDER BY created_at DESC",
    [accountId],
  );
  return rows.map((r) => r.product_id);
}

export async function toggleWishlist(accountId: number, productId: string): Promise<boolean> {
  const pid = Number(productId);
  if (!Number.isFinite(pid)) return false;
  const exists = await q1("SELECT 1 FROM wishlist WHERE account_id = $1 AND product_id = $2", [accountId, pid]);
  if (exists) {
    await q("DELETE FROM wishlist WHERE account_id = $1 AND product_id = $2", [accountId, pid]);
    return false;
  }
  await q("INSERT INTO wishlist (account_id, product_id) VALUES ($1, $2)", [accountId, pid]);
  return true;
}
