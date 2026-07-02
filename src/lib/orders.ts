import type { PoolClient } from "pg";
import { pool, q, q1 } from "./pg";
import { getCart, clearCart } from "./cart";
import { validateCoupon, incrementCouponUsage } from "./coupons";
import { getFinanceSettings, getCostRules, resolveCost } from "./finance";

/**
 * Resolve the per-unit cost for each order line at order time, so COGS is
 * snapshotted and stays correct even if cost settings change later. Under the
 * "markup" basis the cost is derived from the *line* selling price (what we
 * actually charged); under "base" it uses the product's regular price.
 */
async function resolveLineCosts(
  client: PoolClient,
  lines: { product_id: number | string; price: number }[],
): Promise<Map<string, number>> {
  const ids = lines.map((l) => Number(l.product_id));
  const [settings, rules, prods] = await Promise.all([
    getFinanceSettings(),
    getCostRules(),
    client.query<{ id: string; cost_price: string | null; regular_price: string; brand: string }>(
      "SELECT id::text, cost_price::text, regular_price::text, brand FROM products WHERE id = ANY($1)",
      [ids],
    ),
  ]);
  const ruleByBrand = new Map(rules.map((r) => [r.brand, r.pct]));
  const byId = new Map(prods.rows.map((p) => [p.id, p]));
  const out = new Map<string, number>();
  for (const l of lines) {
    const key = String(l.product_id);
    const p = byId.get(key);
    const brandPct = p ? ruleByBrand.get(p.brand) : undefined;
    out.set(key, resolveCost(
      {
        cost_price: p?.cost_price != null ? Number(p.cost_price) : null,
        price: l.price,
        regular_price: p ? Number(p.regular_price) : 0,
        brand: p?.brand,
      },
      settings,
      brandPct,
    ));
  }
  return out;
}

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
  couponCode?: string;
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
  ttn: string;
  tracking_url: string;
  source: string;
  coupon_code: string;
  discount: number;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  items: OrderItem[];
};

export type OrderEvent = {
  id: number;
  order_id: number;
  type: string;
  message: string;
  author: string;
  created_at: string;
};

export const ORDER_STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded"] as const;

// Statuses that free up reserved stock (order no longer consumes inventory).
const STOCK_RELEASING = new Set(["cancelled", "refunded"]);

/** Nova Poshta public tracking URL for a TTN. */
export function npTrackingUrl(ttn: string): string {
  const clean = ttn.replace(/\D/g, "");
  return clean ? `https://novaposhta.ua/tracking/?cargo_number=${clean}` : "";
}

type StockLine = { product_id: number | string; quantity: number; variation?: string };

type PgClient = { query: <R = unknown>(t: string, p?: unknown[]) => Promise<{ rows: R[] }> };

/**
 * Adjust inventory for a set of order lines — fully automatic, size-aware.
 * dir = -1 reserves stock on a sale, +1 releases it on cancellation.
 *
 * Per line: if the order line carries a size (variation) that matches an active
 * product_variant, that variant's stock_qty is changed, a 'sale'/'return' stock
 * movement is logged, and the product mirror is recomputed from its variants —
 * so the warehouse stays correct with zero manual work. If there is no variant
 * match (unmanaged product / no size), it falls back to the product mirror only,
 * never flipping an unmanaged product (NULL stock_qty) to out-of-stock.
 */
async function adjustStock(
  client: PgClient,
  lines: StockLine[],
  dir: -1 | 1,
  ctx?: { note?: string },
): Promise<void> {
  const moveType = dir < 0 ? "sale" : "return";
  const note = ctx?.note ?? "";
  for (const l of lines) {
    const pid = Number(l.product_id);
    const size = (l.variation ?? "").trim();
    let handledByVariant = false;

    if (size) {
      const res = await client.query<{ id: number; stock_qty: number }>(
        `UPDATE product_variants
           SET stock_qty = GREATEST(0, stock_qty + $1::int * $2::int),
               updated_at = now(), updated_by = 'order'
         WHERE product_id = $3::bigint AND size = $4 AND active
         RETURNING id, stock_qty`,
        [dir, l.quantity, pid, size],
      );
      if (res.rows.length) {
        const v = res.rows[0];
        await client.query(
          `INSERT INTO stock_movements (product_id, variant_id, size, type, delta, qty_after, note, author)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'system')`,
          [pid, v.id, size, moveType, dir * l.quantity, v.stock_qty, note],
        );
        await client.query(
          `UPDATE products p SET stock_qty = s.total, is_in_stock = (s.total > 0), updated_at = now()
             FROM (SELECT COALESCE(SUM(stock_qty),0) AS total FROM product_variants WHERE product_id = $1 AND active) s
            WHERE p.id = $1`,
          [pid],
        );
        handledByVariant = true;
      }
    }

    if (!handledByVariant) {
      await client.query(
        `UPDATE products
           SET stock_qty = GREATEST(0, COALESCE(stock_qty,0) + $1::int * $2::int),
               is_in_stock = GREATEST(0, COALESCE(stock_qty,0) + $1::int * $2::int) > 0,
               updated_at = now()
         WHERE id = $3::bigint AND stock_qty IS NOT NULL`,
        [dir, l.quantity, pid],
      );
    }
  }
}

/** Append a timeline event to an order. */
export async function addOrderEvent(
  orderId: number,
  type: string,
  message: string,
  author = "admin",
): Promise<void> {
  await q(
    "INSERT INTO order_events (order_id, type, message, author) VALUES ($1,$2,$3,$4)",
    [orderId, type, message, author],
  );
}

export async function getOrderEvents(orderId: number): Promise<OrderEvent[]> {
  return q<OrderEvent>(
    `SELECT id, order_id, type, message, author, created_at
     FROM order_events WHERE order_id = $1 ORDER BY created_at DESC, id DESC`,
    [orderId],
  );
}

/** Set / clear the Nova Poshta TTN; auto-derives the tracking URL and logs it. */
export async function setOrderTracking(orderId: number, ttn: string): Promise<void> {
  const clean = ttn.trim();
  const url = npTrackingUrl(clean);
  await q("UPDATE orders SET ttn = $1, tracking_url = $2, updated_at = now() WHERE id = $3", [clean, url, orderId]);
  await addOrderEvent(orderId, "ttn", clean ? `ТТН: ${clean}` : "ТТН видалено");
}

/** Create an order from the current cart, snapshotting item data + prices. */
export async function createOrder(input: OrderInput): Promise<{ id: number; number: string }> {
  const cart = await getCart(input.cartToken);
  if (cart.items.length === 0) throw new Error("Кошик порожній");

  // Apply a coupon if one was supplied and still valid for this subtotal.
  let discount = 0;
  let couponCode = "";
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(input.couponCode, cart.subtotal);
    if (v.ok) { discount = v.discount; couponCode = v.code; }
  }
  const total = Math.max(0, cart.subtotal - discount);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO orders
         (account_id, email, phone, first_name, last_name, status, payment_method,
          shipping_method, shipping_city, shipping_branch, comment, coupon_code, discount,
          subtotal, shipping_cost, total)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,'novaposhta',$7,$8,$9,$10,$11,$12,0,$13)
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
        couponCode,
        discount,
        cart.subtotal,
        total,
      ],
    );
    const id = ins.rows[0].id as number;
    const number = `MG-${100000 + id}`;
    await client.query("UPDATE orders SET number = $1 WHERE id = $2", [number, id]);

    const costs = await resolveLineCosts(client, cart.items);
    for (const it of cart.items) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, name, brand, slug, image_src, variation, price, quantity, line_total, cost_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, Number(it.product_id), it.name, it.brand, it.slug, it.image ?? "", it.variation, it.price, it.quantity, it.line_total, costs.get(String(it.product_id)) ?? 0],
      );
    }

    // Reserve inventory and mark the order so a later cancellation can release it.
    await adjustStock(client, cart.items, -1, { note: `Продаж · ${number}` });
    await client.query("UPDATE orders SET stock_applied = TRUE WHERE id = $1", [id]);
    const createdMsg = `Замовлення ${number} створено · ${total.toLocaleString("uk-UA")} ₴`
      + (discount > 0 ? ` (знижка ${discount.toLocaleString("uk-UA")} ₴, код ${couponCode})` : "");
    await client.query(
      "INSERT INTO order_events (order_id, type, message, author) VALUES ($1,'created',$2,'system')",
      [id, createdMsg],
    );
    await client.query("COMMIT");

    if (couponCode) await incrementCouponUsage(couponCode);
    await clearCart(input.cartToken);
    return { id, number };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export type ManualOrderInput = {
  accountId?: number | null;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  shippingCity: string;
  shippingBranch: string;
  comment?: string;
  paymentMethod?: "cod" | "prepay";
  items: { product_id: number; variation: string; quantity: number }[];
};

/** Create an order by hand (phone / Instagram sale), snapshotting product data. */
export async function createManualOrder(input: ManualOrderInput): Promise<{ id: number; number: string }> {
  const lines = input.items.filter((i) => i.quantity > 0);
  if (lines.length === 0) throw new Error("Додайте хоча б один товар");

  const ids = lines.map((l) => Number(l.product_id));
  const products = await q<{ id: string; name: string; brand: string; slug: string; image_src: string; price: number }>(
    `SELECT id::text AS id, name, brand, slug, image_src, price::float AS price
     FROM products WHERE id = ANY($1)`,
    [ids],
  );
  const byId = new Map(products.map((p) => [p.id, p]));

  const snapshot = lines.map((l) => {
    const p = byId.get(String(l.product_id));
    if (!p) throw new Error(`Товар ${l.product_id} не знайдено`);
    return {
      product_id: Number(l.product_id),
      name: p.name, brand: p.brand, slug: p.slug, image_src: p.image_src,
      variation: l.variation, price: p.price, quantity: l.quantity,
      line_total: p.price * l.quantity,
    };
  });
  const subtotal = snapshot.reduce((s, l) => s + l.line_total, 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO orders
         (account_id, email, phone, first_name, last_name, status, payment_method,
          shipping_method, shipping_city, shipping_branch, comment, source, subtotal, shipping_cost, total)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,'novaposhta',$7,$8,$9,'manual',$10,0,$10)
       RETURNING id`,
      [
        input.accountId ?? null, input.email, input.phone, input.firstName, input.lastName,
        input.paymentMethod ?? "cod", input.shippingCity, input.shippingBranch, input.comment ?? "", subtotal,
      ],
    );
    const id = ins.rows[0].id as number;
    const number = `MG-${100000 + id}`;
    await client.query("UPDATE orders SET number = $1 WHERE id = $2", [number, id]);

    const costs = await resolveLineCosts(client, snapshot);
    for (const l of snapshot) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, name, brand, slug, image_src, variation, price, quantity, line_total, cost_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, l.product_id, l.name, l.brand, l.slug, l.image_src, l.variation, l.price, l.quantity, l.line_total, costs.get(String(l.product_id)) ?? 0],
      );
    }
    await adjustStock(client, snapshot, -1, { note: `Продаж · ${number}` });
    await client.query("UPDATE orders SET stock_applied = TRUE WHERE id = $1", [id]);
    await client.query(
      "INSERT INTO order_events (order_id, type, message, author) VALUES ($1,'created',$2,'admin')",
      [id, `Ручне замовлення ${number} створено · ${subtotal.toLocaleString("uk-UA")} ₴`],
    );
    await client.query("COMMIT");
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
    discount: Number(o.discount ?? 0),
    total: Number(o.total),
    items: byOrder.get(o.id as number) ?? [],
  }));
}

const ORDER_SELECT = `id, number, account_id, email, phone, first_name, last_name, status,
  payment_method, shipping_method, shipping_city, shipping_branch, comment,
  ttn, tracking_url, source, coupon_code, discount,
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Очікує оплати", processing: "В обробці", "on-hold": "На утриманні",
  completed: "Виконано", cancelled: "Скасовано", refunded: "Повернуто",
};

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) throw new Error("Невірний статус");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      "SELECT status, stock_applied FROM orders WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (cur.rows.length === 0) throw new Error("Замовлення не знайдено");
    const prev = cur.rows[0].status as string;
    const applied = cur.rows[0].stock_applied as boolean;
    if (prev === status) { await client.query("ROLLBACK"); return; }

    const items = await client.query<{ product_id: string; quantity: number; variation: string }>(
      "SELECT product_id::text AS product_id, quantity, variation FROM order_items WHERE order_id = $1",
      [id],
    );
    const releasing = STOCK_RELEASING.has(status);
    const wasReleasing = STOCK_RELEASING.has(prev);

    // Release stock when moving into cancelled/refunded; re-reserve when leaving it.
    if (releasing && applied) {
      await adjustStock(client, items.rows, 1, { note: `Повернення · замовлення #${id}` });
      await client.query("UPDATE orders SET stock_applied = FALSE WHERE id = $1", [id]);
      await client.query("INSERT INTO order_events (order_id, type, message, author) VALUES ($1,'stock','Залишки повернено на склад','system')", [id]);
    } else if (wasReleasing && !releasing && !applied) {
      await adjustStock(client, items.rows, -1, { note: `Резерв · замовлення #${id}` });
      await client.query("UPDATE orders SET stock_applied = TRUE WHERE id = $1", [id]);
      await client.query("INSERT INTO order_events (order_id, type, message, author) VALUES ($1,'stock','Залишки знову зарезервовано','system')", [id]);
    }

    await client.query("UPDATE orders SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
    await client.query(
      "INSERT INTO order_events (order_id, type, message, author) VALUES ($1,'status',$2,'admin')",
      [id, `Статус: ${STATUS_LABELS[prev] ?? prev} → ${STATUS_LABELS[status] ?? status}`],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Revenue counts orders that represent real sales (not cancelled/refunded).
const REVENUE_STATUSES = "('pending','processing','on-hold','completed')";

export type DashboardStats = {
  products_total: number;
  in_stock: number;
  out_of_stock: number;
  /** In stock + published, but no photo — so the storefront hides them by
   *  default (see lib/productSource.ts hasImg / "require_product_photo"). */
  no_photo_live: number;
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
       (SELECT count(*) FROM products WHERE status='publish' AND is_in_stock
          AND NOT (images IS NOT NULL AND images::text NOT IN ('[]','null','')))::text AS no_photo_live,
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
    no_photo_live: num("no_photo_live"),
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
