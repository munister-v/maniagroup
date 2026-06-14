import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Магазин",
    links: [
      { label: "Жінкам", href: "/catalog?category=women" },
      { label: "Чоловікам", href: "/catalog?category=men" },
      { label: "Бренди", href: "/catalog" },
      { label: "Новинки", href: "/catalog?sort=newest" },
      { label: "Sale", href: "/catalog?sort=price_asc" },
    ],
  },
  {
    title: "Допомога",
    links: [
      { label: "Доставка та оплата", href: "/delivery" },
      { label: "Обмін і повернення", href: "/returns" },
      { label: "Контакти", href: "/contacts" },
    ],
  },
  {
    title: "Компанія",
    links: [
      { label: "Про Mania Group", href: "/about" },
      { label: "Гарантія оригіналу", href: "/about" },
    ],
  },
];

export async function Footer() {
  const content = await getSiteContent();
  const { phone, email, instagram, facebook } = content.contacts;

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
          {phone && (
            <a
              href={`tel:${phone.replace(/\s/g, "")}`}
              className="mt-5 inline-block text-sm tracking-wide text-ink hover:opacity-60"
            >
              {phone}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="mt-2 block text-sm text-muted hover:text-ink"
            >
              {email}
            </a>
          )}
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="text-[11px] uppercase tracking-luxe text-ink">
              {col.title}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted transition-colors hover:text-ink"
                  >
                    {l.label}
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
            {instagram && (
              <a href={instagram} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                Instagram
              </a>
            )}
            {!instagram && <span>Instagram</span>}
            {facebook && (
              <a href={facebook} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                Facebook
              </a>
            )}
            {!facebook && <span>Facebook</span>}
          </div>
        </div>
      </div>
    </footer>
  );
}
