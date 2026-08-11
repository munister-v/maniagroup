import Link from "next/link";
import type { Metadata } from "next";

// Без цього вкладка на 404 підписана як головна («Mania Group — брендовий
// одяг…»), і у списку вкладок чи в історії неможливо зрозуміти, що сторінки
// просто немає.
export const metadata: Metadata = {
  title: "Сторінку не знайдено",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="wrap flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-[11px] uppercase tracking-luxe text-muted">Помилка 404</p>
      <h1 className="mt-4 font-display text-5xl text-ink md:text-7xl">
        Сторінку не знайдено
      </h1>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
        Можливо, товар розпродано або посилання застаріло. Спробуйте перейти до
        каталогу, там завжди є щось нове.
      </p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-5">
        <Link
          href="/catalog"
          className="inline-flex h-12 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
        >
          До каталогу
        </Link>
        <Link href="/" className="link-underline text-[12px] uppercase tracking-luxe text-ink">
          На головну →
        </Link>
      </div>
    </section>
  );
}
