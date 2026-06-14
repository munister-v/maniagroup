import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { hasWcCredentials } from "@/lib/wcAdmin";

const WC_REST = "https://maniagroup.com.ua/wp-json/wc/v3";
const WC_STORE = "https://maniagroup.com.ua/wp-json/wc/store";

function authHeader() {
  const key = process.env.WOOCOMMERCE_KEY ?? "";
  const secret = process.env.WOOCOMMERCE_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function wcCount(status: string): Promise<number> {
  try {
    const res = await fetch(`${WC_REST}/orders?status=${status}&per_page=1`, {
      headers: { Authorization: authHeader() },
      cache: "no-store",
    });
    return parseInt(res.headers.get("x-wp-total") ?? "0", 10);
  } catch {
    return 0;
  }
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  let productsTotal = 0;
  try {
    const res = await fetch(`${WC_STORE}/products?per_page=1`, { cache: "no-store" });
    productsTotal = parseInt(res.headers.get("x-wp-total") ?? "0", 10);
  } catch {}

  if (!hasWcCredentials()) {
    return NextResponse.json({ products_total: productsTotal, has_wc_creds: false });
  }

  const [processing, pending, onHold] = await Promise.all([
    wcCount("processing"),
    wcCount("pending"),
    wcCount("on-hold"),
  ]);

  return NextResponse.json({
    products_total: productsTotal,
    has_wc_creds: true,
    processing,
    pending,
    on_hold: onHold,
  });
}
