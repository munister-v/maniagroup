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
export async function listOrders(opts: { page?: number; perPage?: number; status?: string } = {}): Promise<{ orders: Order[]; total: number }> {
  const perPage = opts.perPage ?? 20;
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.status) { bind.push(opts.status); conds.push(`status = $${bind.length}`); }
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

export async function getOrderStats(): Promise<{
  products_total: number;
  orders_total: number;
  pending: number;
  processing: number;
  on_hold: number;
  revenue: number;
}> {
  const row = await q1<{
    products_total: string; orders_total: string; pending: string;
    processing: string; on_hold: string; revenue: string;
  }>(
    `SELECT
       (SELECT count(*) FROM products WHERE status='publish')::text AS products_total,
       (SELECT count(*) FROM orders)::text AS orders_total,
       (SELECT count(*) FROM orders WHERE status='pending')::text AS pending,
       (SELECT count(*) FROM orders WHERE status='processing')::text AS processing,
       (SELECT count(*) FROM orders WHERE status='on-hold')::text AS on_hold,
       (SELECT COALESCE(sum(total),0) FROM orders WHERE status IN ('processing','completed'))::text AS revenue`,
  );
  return {
    products_total: Number(row?.products_total ?? 0),
    orders_total: Number(row?.orders_total ?? 0),
    pending: Number(row?.pending ?? 0),
    processing: Number(row?.processing ?? 0),
    on_hold: Number(row?.on_hold ?? 0),
    revenue: Number(row?.revenue ?? 0),
  };
}
