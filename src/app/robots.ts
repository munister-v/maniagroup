import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL, CANONICAL_HOST, SITE_INDEXABLE } from "@/lib/siteUrl";

// AI-краулери влаштовували вибух трафіку на комбінаціях фільтрів каталогу.
const AI_CRAWLERS = [
  "GPTBot",
  "meta-externalagent",
  "FacebookBot",
  "CCBot",
  "anthropic-ai",
  "Claude-Web",
];

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
        disallow: ["/admin", "/api/", "/account/", "/cart/", "/checkout/"],
      },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/catalog?*" })),
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
