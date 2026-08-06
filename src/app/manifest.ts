import type { MetadataRoute } from "next";
import { getSiteContent } from "@/lib/siteContent";

/**
 * Web App Manifest — щоб магазин можна було додати на домашній екран і щоб у
 * Android була нормальна іконка замість зменшеної favicon.
 *
 * Назва й опис беруться з того самого контенту, що й решта SEO: інакше зміна
 * назви в адмінці залишила б тут стару.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { seo } = await getSiteContent();
  return {
    name: seo.defaultTitle,
    short_name: seo.siteName,
    description: seo.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#1a1714",
    lang: "uk",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // maskable — окремий файл із запасом полів: Android обрізає іконку під
      // форму системи, і без нього монограму зрізало б по краях.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
