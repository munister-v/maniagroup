import { q, q1 } from "./pg";

export type Subscriber = {
  id: string;
  email: string;
  source: string;
  created_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Insert a subscriber. Returns "added" or "exists" (idempotent on email). */
export async function addSubscriber(email: string, source = ""): Promise<"added" | "exists"> {
  const clean = email.trim().toLowerCase();
  const row = await q1<{ id: string }>(
    `INSERT INTO subscribers (email, source) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id::text AS id`,
    [clean, source],
  );
  return row ? "added" : "exists";
}

export async function listSubscribers(opts: { q?: string; page?: number; perPage?: number } = {}) {
  const perPage = opts.perPage ?? 50;
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q) {
    bind.push(`%${opts.q.trim()}%`);
    conds.push(`email ILIKE $${bind.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q<Subscriber>(
    `SELECT id::text AS id, email, source, created_at FROM subscribers
     ${where} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM subscribers ${where}`, bind);
  return { subscribers: rows, total: Number(countRow?.cnt ?? 0) };
}

export async function allSubscribers(): Promise<Subscriber[]> {
  return q<Subscriber>(
    `SELECT id::text AS id, email, source, created_at FROM subscribers ORDER BY created_at DESC`,
  );
}
