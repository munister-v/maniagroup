import { q, q1 } from "./pg";
import { getOrdersForCustomer, type Order } from "./orders";

export type CustomerRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  orders_count: number;
  total_spent: number;
  wishlist_count: number;
};

const REVENUE_STATUSES = "('pending','processing','on-hold','completed')";

export async function listCustomers(opts: { q?: string; page?: number; perPage?: number } = {}) {
  const perPage = opts.perPage ?? 30;
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q) {
    bind.push(`%${opts.q.trim()}%`);
    const n = bind.length;
    conds.push(`(a.email ILIKE $${n} OR a.phone ILIKE $${n} OR (a.first_name || ' ' || a.last_name) ILIKE $${n})`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await q<CustomerRow>(
    `SELECT a.id::text AS id, a.email, a.first_name, a.last_name, a.phone, a.created_at,
        (SELECT count(*) FROM orders o WHERE o.account_id = a.id OR lower(o.email) = lower(a.email))::int AS orders_count,
        (SELECT COALESCE(sum(o.total),0) FROM orders o WHERE (o.account_id = a.id OR lower(o.email) = lower(a.email)) AND o.status IN ${REVENUE_STATUSES})::float AS total_spent,
        (SELECT count(*) FROM wishlist w WHERE w.account_id = a.id)::int AS wishlist_count
     FROM accounts a
     ${where}
     ORDER BY a.created_at DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM accounts a ${where}`, bind);
  return { customers: rows, total: Number(countRow?.cnt ?? 0) };
}

export async function getCustomer(id: number): Promise<{ customer: CustomerRow; orders: Order[] } | null> {
  const c = await q1<CustomerRow>(
    `SELECT a.id::text AS id, a.email, a.first_name, a.last_name, a.phone, a.created_at,
        (SELECT count(*) FROM orders o WHERE o.account_id = a.id OR lower(o.email) = lower(a.email))::int AS orders_count,
        (SELECT COALESCE(sum(o.total),0) FROM orders o WHERE (o.account_id = a.id OR lower(o.email) = lower(a.email)) AND o.status IN ${REVENUE_STATUSES})::float AS total_spent,
        (SELECT count(*) FROM wishlist w WHERE w.account_id = a.id)::int AS wishlist_count
     FROM accounts a WHERE a.id = $1`,
    [id],
  );
  if (!c) return null;
  const orders = await getOrdersForCustomer(Number(c.id), c.email, 1, 50);
  return { customer: c, orders };
}
