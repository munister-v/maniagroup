import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";

export async function Footer() {
  const content = await getSiteContent();
  const { phone, email, instagram, facebook } = content.contacts;
  const COLUMNS = content.footer.columns;

  return (
    <footer className="mt-24 border-t border-line pb-20 md:pb-0">
      <div className="wrap grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-2xl tracking-wordmark text-ink">
            MANIA&nbsp;GROUP
          </p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            {content.footer.about}
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
            {!facebook && null}
          </div>
        </div>
      </div>
    </footer>
  );
}
