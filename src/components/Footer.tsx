import Link from "next/link";

const COLUMNS: { title: string; links: string[] }[] = [
  {
    title: "Магазин",
    links: ["Жінкам", "Чоловікам", "Аромати для дому", "Бренди", "Новинки", "Sale"],
  },
  {
    title: "Допомога",
    links: ["Доставка та оплата", "Обмін і повернення", "Таблиця розмірів", "Контакти"],
  },
  {
    title: "Компанія",
    links: ["Про Mania Group", "Гарантія оригіналу", "Політика конфіденційності"],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="wrap grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-2xl tracking-wordmark text-ink">
            MANIA&nbsp;GROUP
          </p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Інтернет-магазин брендового одягу, взуття та аксесуарів. Оригінал,
            дбайливо відібраний у європейських домів моди.
          </p>
          <a
            href="tel:+380963436035"
            className="mt-5 inline-block text-sm tracking-wide text-ink hover:opacity-60"
          >
            +38 (096) 343-60-35
          </a>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-[11px] uppercase tracking-luxe text-ink">
              {col.title}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l}>
                  <Link
                    href="#"
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col items-center justify-between gap-3 py-6 text-[11px] uppercase tracking-luxe text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Mania Group · Усі права захищені</p>
          <div className="flex items-center gap-5">
            <a href="#" className="hover:text-ink">
              Instagram
            </a>
            <a href="#" className="hover:text-ink">
              Facebook
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
