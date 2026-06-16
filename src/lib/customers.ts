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
  last_order?: string | null;
};

export type CustomerNote = { id: number; body: string; author: string; created_at: string };

export type CustomerSegment = "vip" | "regular" | "dormant" | "new" | "lead";

export const SEGMENT_META: Record<CustomerSegment, { label: string; bg: string; color: string }> = {
  vip:     { label: "VIP",        bg: "#f3e5f5", color: "#6a1b9a" },
  regular: { label: "Постійний",  bg: "#e8f5e9", color: "#2e7d32" },
  dormant: { label: "Сплячий",    bg: "#fff3e0", color: "#bf360c" },
  new:     { label: "Новий",      bg: "#e3f2fd", color: "#1565c0" },
  lead:    { label: "Без замовлень", bg: "#f5f1ea", color: "#9c8f7d" },
};

/** RFM-lite segmentation from order count / spend / recency. */
export function customerSegment(c: { orders_count: number; total_spent: number; last_order?: string | null }): CustomerSegment {
  if (c.orders_count === 0) return "lead";
  const daysSince = c.last_order ? (Date.now() - new Date(c.last_order).getTime()) / 86_400_000 : 9999;
  if (c.total_spent >= 20000 || c.orders_count >= 5) return "vip";
  if (c.orders_count >= 1 && daysSince > 90) return "dormant";
  if (c.orders_count >= 2) return "regular";
  return "new";
}

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

export async function getCustomer(id: number): Promise<{
  customer: CustomerRow; orders: Order[]; tags: string[]; notes: CustomerNote[];
  segment: CustomerSegment; avg_order: number;
} | null> {
  const c = await q1<CustomerRow>(
    `SELECT a.id::text AS id, a.email, a.first_name, a.last_name, a.phone, a.created_at,
        (SELECT count(*) FROM orders o WHERE o.account_id = a.id OR lower(o.email) = lower(a.email))::int AS orders_count,
        (SELECT COALESCE(sum(o.total),0) FROM orders o WHERE (o.account_id = a.id OR lower(o.email) = lower(a.email)) AND o.status IN ${REVENUE_STATUSES})::float AS total_spent,
        (SELECT max(o.created_at) FROM orders o WHERE o.account_id = a.id OR lower(o.email) = lower(a.email)) AS last_order,
        (SELECT count(*) FROM wishlist w WHERE w.account_id = a.id)::int AS wishlist_count
     FROM accounts a WHERE a.id = $1`,
    [id],
  );
  if (!c) return null;
  const orders = await getOrdersForCustomer(Number(c.id), c.email, 1, 50);
  const tags = (await q<{ tag: string }>("SELECT tag FROM customer_tags WHERE account_id = $1 ORDER BY tag", [id])).map((t) => t.tag);
  const notes = await q<CustomerNote>(
    "SELECT id, body, author, created_at FROM customer_notes WHERE account_id = $1 ORDER BY created_at DESC, id DESC",
    [id],
  );
  const avg_order = c.orders_count > 0 ? Math.round(c.total_spent / c.orders_count) : 0;
  return { customer: c, orders, tags, notes, segment: customerSegment(c), avg_order };
}

export async function setCustomerTags(accountId: number, tags: string[]): Promise<void> {
  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  await q("DELETE FROM customer_tags WHERE account_id = $1", [accountId]);
  for (const tag of clean) {
    await q("INSERT INTO customer_tags (account_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING", [accountId, tag]);
  }
}

export async function addCustomerNote(accountId: number, body: string): Promise<CustomerNote[]> {
  await q("INSERT INTO customer_notes (account_id, body) VALUES ($1,$2)", [accountId, body.trim()]);
  return q<CustomerNote>(
    "SELECT id, body, author, created_at FROM customer_notes WHERE account_id = $1 ORDER BY created_at DESC, id DESC",
    [accountId],
  );
}
