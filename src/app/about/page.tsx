import Link from "next/link";

export const metadata = {
  title: "Про Mania Group",
  description: "Mania Group — інтернет-магазин оригінального брендового одягу, взуття та аксесуарів.",
};

export default function AboutPage() {
  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        / Про Mania Group
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Про Mania Group</h1>

      <div className="mt-10 max-w-2xl space-y-6 text-sm leading-relaxed text-muted">
        <p>
          Mania Group — інтернет-магазин брендового одягу, взуття та аксесуарів.
          Працюємо напряму з європейськими брендами та офіційними
          дистриб&rsquo;юторами: EA7 Emporio Armani, Moschino, Antony Morato,
          Harmont &amp; Blaine, MC2 Saint Barth, Fred Mello, J.B4, Kocca та інші.
        </p>
        <div>
          <h2 className="mb-2 text-[12px] uppercase tracking-luxe text-ink">Гарантія оригіналу</h2>
          <p>
            Жодних реплік — лише автентичні речі з повним пакетом гарантій
            виробника. Кожна позиція перевіряється перед відправкою.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-[12px] uppercase tracking-luxe text-ink">Контакти</h2>
          <p>
            +38 (096) 343-60-35 · 9:00–20:00 щодня. Доставка Новою Поштою по всій
            Україні.
          </p>
        </div>
      </div>
    </section>
  );
}
