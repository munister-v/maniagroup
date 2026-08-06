import { NextResponse } from "next/server";
import { q1 } from "@/lib/pg";
import { SITE_URL } from "@/lib/siteUrl";

/**
 * Перехід зі старого сайту на цей — за артикулом WooCommerce.
 *
 * `maniagroup.com.ua` лишається жити, але на його картках стоїть посилання
 * сюди. Артикул там — те саме значення, що і `products.sku` у нас (перевірено:
 * SKU 23590 на обох сайтах = та сама блуза BEATRICE), тож із будь-якої старої
 * картки можна потрапити рівно на той самий товар, а не на головну.
 *
 * ⚠️ Чому окремий маршрут, а не пряме посилання на /product/<sku>: у нас
 * products.slug дорівнює ID, а не артикулу. /product/23590 знайшло б товар з
 * ID 23590 — ІНШУ річ. Мовчазна підміна товару гірша за зайвий редирект.
 *
 * Не знайшли артикул (товару вже немає в наявності) — не 404, а пошук по
 * ньому ж: людина принаймні побачить схожі позиції замість глухого кута.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> },
) {
  const { sku } = await params;
  const clean = decodeURIComponent(sku).trim();

  // Абсолютний URL будуємо від SITE_URL, а НЕ від _req.url. За nginx запит
  // приходить у Node як http://localhost:3010/... — і Location вийшов би
  // «localhost:3010», тобто мертвим посиланням для всіх, крім самого сервера.
  const to = (path: string) => NextResponse.redirect(new URL(path, SITE_URL), 308);

  if (!clean) return to("/catalog");

  const row = await q1<{ id: string }>(
    `SELECT id::text FROM products
      WHERE sku = $1 AND status = 'publish'
      ORDER BY is_in_stock DESC
      LIMIT 1`,
    [clean],
  ).catch(() => null);

  // 308, а не 302: це саме «той самий товар тепер тут», постійна адреса.
  return to(row ? `/product/${row.id}` : `/catalog?q=${encodeURIComponent(clean)}`);
}
