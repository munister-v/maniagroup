import { pool, q, q1 } from "./pg";
import { getCart, clearCart } from "./cart";

export type OrderInput = {
  cartToken: string;
  accountId?: number | null;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  shippingCity: string;
  shippingBranch: string;
  comment?: string;
  paymentMethod?: "cod" | "prepay";
};

export type OrderItem = {
  id: number;
  product_id: string;
  name: string;
  brand: string;
  slug: string;
  image_src: string;
  variation: string;
  price: number;
  quantity: number;
  line_total: number;
};

export type Order = {
  id: number;
  number: string;
  account_id: number | null;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  status: string;
  payment_method: string;
  shipping_method: string;
  shipping_city: string;
  shipping_branch: string;
  comment: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  items: OrderItem[];
};

export const ORDER_STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded"] as const;

/** Create an order from the current cart, snapshotting item data + prices. */
export async function createOrder(input: OrderInput): Promise<{ id: number; number: string }> {
  const cart = await getCart(input.cartToken);
  if (cart.items.length === 0) throw new Error("Кошик порожній");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO orders
         (account_id, email, phone, first_name, last_name, status, payment_method,
          shipping_method, shipping_city, shipping_branch, comment, subtotal, shipping_cost, total)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,'novaposhta',$7,$8,$9,$10,0,$10)
       RETURNING id`,
      [
        input.accountId ?? null,
        input.email,
        input.phone,
        input.firstName,
        input.lastName,
        input.paymentMethod ?? "cod",
        input.shippingCity,
        input.shippingBranch,
        input.comment ?? "",
        cart.subtotal,
      ],
    );
    const id = ins.rows[0].id as number;
    const number = `MG-${100000 + id}`;
    await client.query("UPDATE orders SET number = $1 WHERE id = $2", [number, id]);

    for (const it of cart.items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, name, brand, slug, image_src, variation, price, quantity, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, Number(it.product_id), it.name, it.brand, it.slug, it.image ?? "", it.variation, it.price, it.quantity, it.line_total],
      );
    }
    await client.query("COMMIT");

    await clearCart(input.cartToken);
    return { id, number };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function hydrate(orders: Record<string, unknown>[]): Promise<Order[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id as number);
  const items = await q<OrderItem & { order_id: number }>(
    `SELECT id, order_id, product_id::text AS product_id, name, brand, slug, image_src,
            variation, price::float AS price, quantity, line_total::float AS line_total
     FROM order_items WHERE order_id = ANY($1) ORDER BY id ASC`,
    [ids],
  );
  const byOrder = new Map<number, OrderItem[]>();
  for (const it of items) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push(it);
    byOrder.set(it.order_id, arr);
  }
  return orders.map((o) => ({
    ...(o as unknown as Omit<Order, "items">),
    subtotal: Number(o.subtotal),
    shipping_cost: Number(o.shipping_cost),
    total: Number(o.total),
    items: byOrder.get(o.id as number) ?? [],
  }));
}

const ORDER_SELECT = `id, number, account_id, email, phone, first_name, last_name, status,
  payment_method, shipping_method, shipping_city, shipping_branch, comment,
  subtotal, shipping_cost, total, created_at`;

/** Orders for a customer (by account id or, as fallback, email). */
export async function getOrdersForCustomer(
  accountId: number,
  email: string,
  page = 1,
  perPage = 10,
): Promise<Order[]> {
  const offset = (page - 1) * perPage;
  const rows = await q(
    `SELECT ${ORDER_SELECT} FROM orders
     WHERE account_id = $1 OR lower(email) = lower($2)
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [accountId, email, perPage, offset],
  );
  return hydrate(rows);
}

/** Admin order list, optionally filtered by status. */
export async function listOrders(
  opts: { page?: number; perPage?: number; status?: string; q?: string; from?: string; to?: string } = {},
): Promise<{ orders: Order[]; total: number }> {
  const perPage = opts.perPage ?? 20;
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.status) { bind.push(opts.status); conds.push(`status = $${bind.length}`); }
  if (opts.q) {
    bind.push(`%${opts.q.trim()}%`);
    const n = bind.length;
    conds.push(`(number ILIKE $${n} OR phone ILIKE $${n} OR email ILIKE $${n} OR (first_name || ' ' || last_name) ILIKE $${n})`);
  }
  if (opts.from) { bind.push(opts.from); conds.push(`created_at >= $${bind.length}`); }
  if (opts.to)   { bind.push(opts.to);   conds.push(`created_at < ($${bind.length}::date + 1)`); }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await q(
    `SELECT ${ORDER_SELECT} FROM orders ${where} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM orders ${where}`, bind);
  return { orders: await hydrate(rows), total: Number(countRow?.cnt ?? 0) };
}

export async function getOrder(id: number): Promise<Order | null> {
  const row = await q1(`SELECT ${ORDER_SELECT} FROM orders WHERE id = $1`, [id]);
  if (!row) return null;
  return (await hydrate([row]))[0];
}

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) throw new Error("Невірний статус");
  await q("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
}

// Revenue counts orders that represent real sales (not cancelled/refunded).
const REVENUE_STATUSES = "('pending','processing','on-hold','completed')";

export type DashboardStats = {
  products_total: number;
  in_stock: number;
  out_of_stock: number;
  orders_total: number;
  pending: number;
  processing: number;
  on_hold: number;
  completed: number;
  new_orders_7d: number;
  revenue_30d: number;
  revenue_7d: number;
  avg_order: number;
  new_customers_30d: number;
  revenue_series: { day: string; total: number }[];
  top_products: { product_id: string; name: string; brand: string; qty: number; revenue: number }[];
};

export type RevenueAnalytics = {
  days: number;
  revenue: number;
  orders: number;
  avg: number;
  series: { day: string; total: number }[];
  by_brand: { name: string; qty: number; revenue: number }[];
  by_category: { name: string; qty: number; revenue: number }[];
};

/** Windowed revenue analytics for the admin dashboard (7 / 30 / 90 days). */
export async function getRevenueAnalytics(days = 30): Promise<RevenueAnalytics> {
  const d = [7, 30, 90].includes(days) ? days : 30;
  const since = `now() - interval '${d} days'`;

  const totals = await q1<{ revenue: string; orders: string; avg: string }>(
    `SELECT COALESCE(sum(total),0)::text AS revenue, count(*)::text AS orders, COALESCE(avg(total),0)::text AS avg
     FROM orders WHERE status IN ${REVENUE_STATUSES} AND created_at >= ${since}`,
  );

  const series = await q<{ day: string; total: string }>(
    `WITH days AS (
       SELECT generate_series(current_date - interval '${d - 1} days', current_date, interval '1 day')::date AS dd
     )
     SELECT to_char(days.dd, 'YYYY-MM-DD') AS day,
            COALESCE(sum(o.total) FILTER (WHERE o.status IN ${REVENUE_STATUSES}), 0)::text AS total
     FROM days LEFT JOIN orders o ON o.created_at::date = days.dd
     GROUP BY days.dd ORDER BY days.dd ASC`,
  );

  const byBrand = await q<{ name: string; qty: string; revenue: string }>(
    `SELECT NULLIF(oi.brand,'') AS name, sum(oi.quantity)::text AS qty, sum(oi.line_total)::text AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ${REVENUE_STATUSES} AND o.created_at >= ${since} AND oi.brand <> ''
     GROUP BY oi.brand ORDER BY sum(oi.line_total) DESC LIMIT 8`,
  );

  const byCategory = await q<{ name: string; qty: string; revenue: string }>(
    `SELECT COALESCE(NULLIF(p.category,''),'Інше') AS name, sum(oi.quantity)::text AS qty, sum(oi.line_total)::text AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.status IN ${REVENUE_STATUSES} AND o.created_at >= ${since}
     GROUP BY COALESCE(NULLIF(p.category,''),'Інше') ORDER BY sum(oi.line_total) DESC LIMIT 8`,
  );

  return {
    days: d,
    revenue: Number(totals?.revenue ?? 0),
    orders: Number(totals?.orders ?? 0),
    avg: Math.round(Number(totals?.avg ?? 0)),
    series: series.map((s) => ({ day: s.day, total: Number(s.total) })),
    by_brand: byBrand.map((b) => ({ name: b.name, qty: Number(b.qty), revenue: Number(b.revenue) })),
    by_category: byCategory.map((c) => ({ name: c.name, qty: Number(c.qty), revenue: Number(c.revenue) })),
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const row = await q1<Record<string, string>>(
    `SELECT
       (SELECT count(*) FROM products WHERE status='publish')::text AS products_total,
       (SELECT count(*) FROM products WHERE status='publish' AND is_in_stock)::text AS in_stock,
       (SELECT count(*) FROM products WHERE status='publish' AND NOT is_in_stock)::text AS out_of_stock,
       (SELECT count(*) FROM orders)::text AS orders_total,
       (SELECT count(*) FROM orders WHERE status='pending')::text AS pending,
       (SELECT count(*) FROM orders WHERE status='processing')::text AS processing,
       (SELECT count(*) FROM orders WHERE status='on-hold')::text AS on_hold,
       (SELECT count(*) FROM orders WHERE status='completed')::text AS completed,
       (SELECT count(*) FROM orders WHERE created_at >= now() - interval '7 days')::text AS new_orders_7d,
       (SELECT COALESCE(sum(total),0) FROM orders WHERE status IN ${REVENUE_STATUSES} AND created_at >= now() - interval '30 days')::text AS revenue_30d,
       (SELECT COALESCE(sum(total),0) FROM orders WHERE status IN ${REVENUE_STATUSES} AND created_at >= now() - interval '7 days')::text AS revenue_7d,
       (SELECT COALESCE(avg(total),0) FROM orders WHERE status IN ${REVENUE_STATUSES})::text AS avg_order,
       (SELECT count(*) FROM accounts WHERE created_at >= now() - interval '30 days')::text AS new_customers_30d`,
  );

  // Daily revenue for the last 7 days (zero-filled).
  const series = await q<{ day: string; total: string }>(
    `WITH days AS (
       SELECT generate_series(current_date - interval '6 days', current_date, interval '1 day')::date AS d
     )
     SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
            COALESCE(sum(o.total) FILTER (WHERE o.status IN ${REVENUE_STATUSES}), 0)::text AS total
     FROM days
     LEFT JOIN orders o ON o.created_at::date = days.d
     GROUP BY days.d ORDER BY days.d ASC`,
  );

  const top = await q<{ product_id: string; name: string; brand: string; qty: string; revenue: string }>(
    `SELECT oi.product_id::text AS product_id,
            max(oi.name) AS name, max(oi.brand) AS brand,
            sum(oi.quantity)::text AS qty, sum(oi.line_total)::text AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN ${REVENUE_STATUSES}
     GROUP BY oi.product_id ORDER BY sum(oi.quantity) DESC LIMIT 6`,
  );

  const num = (k: string) => Number(row?.[k] ?? 0);
  return {
    products_total: num("products_total"),
    in_stock: num("in_stock"),
    out_of_stock: num("out_of_stock"),
    orders_total: num("orders_total"),
    pending: num("pending"),
    processing: num("processing"),
    on_hold: num("on_hold"),
    completed: num("completed"),
    new_orders_7d: num("new_orders_7d"),
    revenue_30d: num("revenue_30d"),
    revenue_7d: num("revenue_7d"),
    avg_order: Math.round(num("avg_order")),
    new_customers_30d: num("new_customers_30d"),
    revenue_series: series.map((s) => ({ day: s.day, total: Number(s.total) })),
    top_products: top.map((t) => ({
      product_id: t.product_id, name: t.name, brand: t.brand,
      qty: Number(t.qty), revenue: Number(t.revenue),
    })),
  };
}
