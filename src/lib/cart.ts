import crypto from "crypto";
import { cookies } from "next/headers";
import { q, q1 } from "./pg";

/**
 * First-party cart engine (Postgres). Replaces the WooCommerce Store API cart.
 * A cart is keyed by an httpOnly cookie token; items reference local product
 * ids. Prices are always recomputed from the products table so they can't go
 * stale.
 */

export const CART_COOKIE = "mg_cart";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CartItem = {
  key: string; // cart_items.id as string
  product_id: string;
  name: string;
  brand: string;
  slug: string;
  image?: string;
  variation: string; // size, "" when none
  price: number;
  quantity: number;
  line_total: number;
};

export type Cart = {
  items: CartItem[];
  items_count: number;
  subtotal: number;
};

const EMPTY: Cart = { items: [], items_count: 0, subtotal: 0 };

/** Read the cart token from the cookie jar (no creation). */
export async function readCartToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value;
}

/** Read or create a cart token, persisting the cookie + a carts row. */
export async function ensureCartToken(accountId?: number): Promise<string> {
  const jar = await cookies();
  let token = jar.get(CART_COOKIE)?.value;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    jar.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  }
  await q(
    `INSERT INTO carts (token, account_id) VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE SET updated_at = now(), account_id = COALESCE(EXCLUDED.account_id, carts.account_id)`,
    [token, accountId ?? null],
  );
  return token;
}

/** Build the cart view, joining items with live product data. */
export async function getCart(token?: string): Promise<Cart> {
  if (!token) return EMPTY;
  const rows = await q<{
    key: string; product_id: string; variation: string; quantity: number;
    name: string; brand: string; slug: string; image_src: string;
    regular_price: string; sale_price: string | null; is_in_stock: boolean;
  }>(
    `SELECT ci.id::text AS key, ci.product_id::text AS product_id, ci.variation, ci.quantity,
            p.name, p.brand, p.slug, p.image_src,
            p.regular_price, p.sale_price, p.is_in_stock
     FROM cart_items ci JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_token = $1
     ORDER BY ci.id ASC`,
    [token],
  );

  const items: CartItem[] = rows.map((r) => {
    const regular = Number(r.regular_price);
    const sale = r.sale_price === null ? null : Number(r.sale_price);
    const price = sale !== null && sale < regular ? sale : regular;
    return {
      key: r.key,
      product_id: r.product_id,
      name: r.name,
      brand: r.brand,
      slug: r.slug || r.product_id,
      image: r.image_src || undefined,
      variation: r.variation,
      price,
      quantity: r.quantity,
      line_total: price * r.quantity,
    };
  });

  return {
    items,
    items_count: items.reduce((n, it) => n + it.quantity, 0),
    subtotal: items.reduce((s, it) => s + it.line_total, 0),
  };
}

export async function addItem(
  token: string,
  productId: string,
  variation: string,
  quantity: number,
): Promise<Cart> {
  const pid = Number(productId);
  if (!Number.isFinite(pid)) throw new Error("Невірний товар");
  const product = await q1<{ is_in_stock: boolean }>(
    "SELECT is_in_stock FROM products WHERE id = $1 AND status = 'publish'",
    [pid],
  );
  if (!product) throw new Error("Товар не знайдено");
  if (!product.is_in_stock) throw new Error("Товару немає в наявності");

  await q(
    `INSERT INTO cart_items (cart_token, product_id, variation, quantity)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_token, product_id, variation)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [token, pid, variation ?? "", Math.max(1, quantity)],
  );
  return getCart(token);
}

export async function updateItem(token: string, key: string, quantity: number): Promise<Cart> {
  const id = Number(key);
  if (!Number.isFinite(id)) return getCart(token);
  if (quantity <= 0) {
    await q("DELETE FROM cart_items WHERE id = $1 AND cart_token = $2", [id, token]);
  } else {
    await q("UPDATE cart_items SET quantity = $1 WHERE id = $2 AND cart_token = $3", [quantity, id, token]);
  }
  return getCart(token);
}

export async function clearCart(token: string): Promise<void> {
  await q("DELETE FROM cart_items WHERE cart_token = $1", [token]);
}
