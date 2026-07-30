import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL, CANONICAL_HOST, SITE_INDEXABLE } from "@/lib/siteUrl";

// headers() робить цей маршрут динамічним — robots.txt має відрізнятися
// залежно від домену, тому кешувати його не можна.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.split(":")[0];

  // Дзеркало (maniagroup.munister.com.ua) і ще не запущений магазин мають бути
  // закриті повністю — інакше в індексі опиняться два однакові каталоги.
  if (!SITE_INDEXABLE || host !== CANONICAL_HOST) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/admin",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
