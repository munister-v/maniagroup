import type { Metadata } from "next";

/**
 * Адмінка ніколи не має потрапляти в пошук.
 *
 * У robots.txt її новий шлях вписати не можна — цей файл публічний, і запис
 * там сам би його й розкрив. Тому закриваємо мета-тегом на самих сторінках:
 * він діє незалежно від того, як саме краулер про них дізнався.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
