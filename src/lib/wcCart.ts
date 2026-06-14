// Backend layer: proxies the WooCommerce Store API cart (on
// maniagroup.com.ua) so the new frontend can add/update/remove items and
// eventually checkout against the real store, before a dedicated backend
// exists.

const WC_BASE = "https://maniagroup.com.ua/wp-json/wc/store";

export type WcCartItem = {
  key: string;
  id: number;
  quantity: number;
  name: string;
  prices: { price: string; currency_minor_unit: number };
  images: { src: string }[];
  variation: { attribute: string; value: string }[];
  totals: { line_total: string };
};

export type WcCart = {
  items: WcCartItem[];
  items_count: number;
  totals: { total_price: string; currency_minor_unit: number };
};

type WcCartResult = { cart: WcCart; sessionCookie?: string };

/** Extract just the `name=value` pairs we care about from Set-Cookie headers. */
function mergeSessionCookie(setCookies: string[], existing?: string): string | undefined {
  const jar = new Map<string, string>();
  if (existing) {
    for (const pair of existing.split(/;\s*/)) {
      const [name, ...rest] = pair.split("=");
      if (name) jar.set(name, rest.join("="));
    }
  }
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const [name, ...rest] = pair.split("=");
    if (name?.startsWith("wp_woocommerce_session_") || name === "woocommerce_cart_hash" || name === "woocommerce_items_in_cart") {
      jar.set(name, rest.join("="));
    }
  }
  if (jar.size === 0) return existing;
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function wcRequest(
  path: string,
  init: RequestInit & { sessionCookie?: string } = {},
): Promise<{ cart: WcCart; nonce: string; sessionCookie?: string }> {
  const { sessionCookie, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (sessionCookie) headers.Cookie = sessionCookie;

  const res = await fetch(`${WC_BASE}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });

  const cart = (await res.json()) as WcCart;
  if (!res.ok) {
    throw new Error((cart as unknown as { message?: string }).message ?? `WC cart ${path} failed`);
  }

  const nonce = res.headers.get("x-wc-store-api-nonce") ?? "";
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const newSessionCookie = mergeSessionCookie(setCookies, sessionCookie);

  return { cart, nonce, sessionCookie: newSessionCookie };
}

export async function getCart(sessionCookie?: string): Promise<WcCartResult> {
  const { cart, sessionCookie: next } = await wcRequest("/cart", { sessionCookie });
  return { cart, sessionCookie: next };
}

async function withNonce(sessionCookie: string | undefined) {
  const { nonce, sessionCookie: next } = await wcRequest("/cart", { sessionCookie });
  return { nonce, sessionCookie: next };
}

export async function addCartItem(
  sessionCookie: string | undefined,
  id: number,
  quantity = 1,
): Promise<WcCartResult> {
  const { nonce, sessionCookie: cookie } = await withNonce(sessionCookie);
  const { cart, sessionCookie: next } = await wcRequest("/cart/add-item", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-WC-Store-API-Nonce": nonce },
    body: JSON.stringify({ id, quantity }),
    sessionCookie: cookie,
  });
  return { cart, sessionCookie: next };
}

export async function updateCartItem(
  sessionCookie: string | undefined,
  key: string,
  quantity: number,
): Promise<WcCartResult> {
  const { nonce, sessionCookie: cookie } = await withNonce(sessionCookie);
  const path = quantity > 0 ? "/cart/update-item" : "/cart/remove-item";
  const body = quantity > 0 ? { key, quantity } : { key };
  const { cart, sessionCookie: next } = await wcRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-WC-Store-API-Nonce": nonce },
    body: JSON.stringify(body),
    sessionCookie: cookie,
  });
  return { cart, sessionCookie: next };
}

export async function clearCart(sessionCookie: string | undefined): Promise<string | undefined> {
  const { nonce, sessionCookie: cookie } = await withNonce(sessionCookie);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-WC-Store-API-Nonce": nonce,
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${WC_BASE}/cart/items`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return mergeSessionCookie(setCookies, cookie);
}

export function cartItemPriceUah(item: WcCartItem): number {
  return Math.round(Number(item.totals.line_total) / 10 ** item.prices.currency_minor_unit);
}

export type Address = {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
};

export type CheckoutResult =
  | { ok: true; orderId: number; status: string; sessionCookie?: string }
  | { ok: false; message: string };

export async function placeOrder(
  sessionCookie: string | undefined,
  billing: Address,
  note?: string,
): Promise<CheckoutResult> {
  const { nonce, sessionCookie: cookie } = await withNonce(sessionCookie);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-WC-Store-API-Nonce": nonce,
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${WC_BASE}/checkout`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      billing_address: billing,
      shipping_address: {
        first_name: billing.first_name,
        last_name: billing.last_name,
        address_1: billing.address_1,
        city: billing.city,
        state: billing.state,
        postcode: billing.postcode,
        country: billing.country,
      },
      payment_method: "cod",
      customer_note: note ?? "",
    }),
  });

  const data = (await res.json()) as {
    order_id?: number;
    status?: string;
    message?: string;
  };

  if (!res.ok || !data.order_id) {
    return { ok: false, message: data.message ?? "Не вдалося оформити замовлення" };
  }

  const setCookies = res.headers.getSetCookie?.() ?? [];
  return {
    ok: true,
    orderId: data.order_id,
    status: data.status ?? "pending",
    sessionCookie: mergeSessionCookie(setCookies, cookie),
  };
}
