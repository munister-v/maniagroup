import type { MetadataRoute } from "next";
import { getCatalogCategories, dbBrands, listProductsForSitemap } from "@/lib/productSource";
import { SITE_URL as BASE } from "@/lib/siteUrl";

/**
 * Мапа перебудовується раз на добу. Запит за всіма товарами не той, який варто
 * виконувати на кожне звернення робота, а частіше за добу вона й не змінюється
 * настільки, щоб це мало значення.
 */
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/catalog`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/brands`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/catalog?sale=1`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/catalog?gender=women`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/catalog?gender=men`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/delivery`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/rozmiry-vzuttya`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/rozmiry-odyagu`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/returns`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/contacts`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const categories = await getCatalogCategories().catch(() => []);
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((c) => c.count > 0)
    .map((c) => ({
      url: `${BASE}/catalog?category=${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

  // Бренд — така сама посадкова сторінка, як категорія, і саме за назвою бренду
  // люди шукають найчастіше. Раніше жодної з них у мапі не було.
  const brands = await dbBrands().catch(() => []);
  const brandPages: MetadataRoute.Sitemap = brands
    .filter((b) => b.count > 0)
    .map((b) => ({
      url: `${BASE}/catalog?brand=${b.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

  // Було жорстке обмеження у 200 товарів — тобто в мапу потрапляли лише 3%
  // каталогу, решта 6+ тисяч сторінок для пошуку не існували.
  const products = await listProductsForSitemap().catch(() => []);
  const productPages: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE}/product/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...brandPages, ...productPages];
}
