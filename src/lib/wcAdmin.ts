const WC_REST = "https://maniagroup.com.ua/wp-json/wc/v3";

export function hasWcCredentials() {
  return !!(process.env.WOOCOMMERCE_KEY && process.env.WOOCOMMERCE_SECRET);
}

function authHeader() {
  const key = process.env.WOOCOMMERCE_KEY ?? "";
  const secret = process.env.WOOCOMMERCE_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

export async function wcAdminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WC_REST}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WC Admin ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function updateProductPrice(
  id: number | string,
  regularPrice: number,
  salePrice?: number | null,
) {
  return wcAdminFetch(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      regular_price: String(regularPrice),
      sale_price: salePrice != null && salePrice > 0 ? String(salePrice) : "",
    }),
  });
}
