import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";

export async function Footer() {
  const content = await getSiteContent();
  const { phone, email, instagram, facebook } = content.contacts;
  const COLUMNS = content.footer.columns;

  return (
    <footer className="mt-20 border-t border-line pb-20 md:pb-0">
      <div className="wrap py-10 md:py-16">
        {/* Desktop: 4-col grid. Mobile: brand compact + links in 3-col row */}
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-12">

          {/* Brand block */}
          <div className="flex items-start justify-between md:block">
            <div>
              <p className="font-display text-xl tracking-wordmark text-ink md:text-2xl">
                MANIA&nbsp;GROUP
              </p>
              <p className="mt-3 hidden max-w-xs text-sm leading-relaxed text-muted md:block">
                {content.footer.about}
              </p>
            </div>
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="text-sm tracking-wide text-ink hover:opacity-60 md:mt-5 md:inline-block"
              >
                {phone}
              </a>
            )}
          </div>

          {/* Link columns — 3-col on mobile, individual on desktop via md:contents */}
          <div className="grid grid-cols-3 gap-4 md:contents">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-[10px] uppercase tracking-luxe text-ink md:text-[11px]">
                  {col.title}
                </h4>
                <ul className="mt-3 space-y-2 md:mt-4 md:space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[13px] text-muted transition-colors hover:text-ink md:text-sm"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col items-center justify-between gap-2.5 py-5 text-[10px] uppercase tracking-luxe text-muted md:flex-row md:py-6 md:text-[11px]">
          <p>© {new Date().getFullYear()} Mania Group · Усі права захищені</p>
          <div className="flex items-center gap-5">
            <a
              href={instagram || "https://instagram.com/maniagroup.ua"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink"
            >
              Instagram
            </a>
            <a
              href="https://t.me/maniagroup_ua"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink"
            >
              Telegram
            </a>
            {facebook && (
              <a href={facebook} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                Facebook
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
