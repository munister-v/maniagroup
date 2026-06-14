import type { MetadataRoute } from "next";
import { fetchCategories, fetchProducts } from "@/lib/wc";

const BASE = "https://maniagroup.munister.com.ua";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/catalog`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/delivery`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/returns`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/contacts`, changeFrequency: "monthly", priority: 0.3 },
  ];

  const categories = await fetchCategories().catch(() => []);
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((c) => c.count > 0)
    .map((c) => ({
      url: `${BASE}/catalog?category=${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

  const products = await fetchProducts({ perPage: 100, orderby: "date" }).catch(() => []);
  const productPages: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE}/product/${p.id}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
