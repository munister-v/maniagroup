import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";

function socialHandle(url: string, fallback: string) {
  const match = url.match(/(?:instagram\.com|t\.me)\/([^/?#]+)/i);
  return match?.[1] ? `@${match[1]}` : fallback;
}

function SocialIcon({ kind }: { kind: "instagram" | "telegram" }) {
  if (kind === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z" />
        <path d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
        <path d="M17.5 6.5h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="m21.5 4.5-3 14.1c-.2 1-1 1.2-1.8.7l-4.6-3.4-2.2 2.1c-.2.3-.5.5-.9.5l.3-4.8 8.8-7.9c.4-.4-.1-.6-.5-.3l-10.9 6.8-4.7-1.5c-1-.3-1-.9.2-1.4L19.2 3c.8-.3 1.5.2 1.3 1.5Z" />
    </svg>
  );
}

export async function Footer() {
  const content = await getSiteContent();
  const { phone, instagram, facebook, telegram } = content.contacts;
  const COLUMNS = content.footer.columns;
  const instagramHandle = instagram ? socialHandle(instagram, "@mania.group") : "@mania.group";
  const telegramHandle = telegram ? socialHandle(telegram, "@ManiaGroupKiev") : "@ManiaGroupKiev";

  return (
    <footer className="mt-16 border-t border-line md:mt-20">
      <div className="wrap py-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-12">
          <div className="border-b border-line/80 pb-8 md:border-b-0 md:pb-0">
            {/* Було: телефон і кожна соцмережа — окрема велика «таблетка» з
                рамкою. Три бордюрні капсули поспіль важили більше за саму
                вивіску й на телефоні лягали в стовпчик на пів екрана. Тепер
                головне велике (телефон антиквою — його й набирають), решта —
                тихі рядки з іконкою. Ціль пальця тримає min-h, а не рамка. */}
            <div>
              <p className="text-[10px] uppercase tracking-[0.26em] text-muted">Контакти магазину</p>
              <p className="mt-3 font-display text-xl tracking-wordmark text-ink md:text-2xl">
                MANIA&nbsp;GROUP
              </p>
            </div>

            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="group mt-5 inline-flex min-h-11 items-center font-display text-2xl text-ink transition-colors hover:text-ink/60 md:text-[1.75rem]"
              >
                {phone}
                <span className="ml-3 h-px w-8 bg-line transition-all duration-300 group-hover:w-12 group-hover:bg-ink" />
              </a>
            )}
            <p className="mt-1 text-[11px] uppercase tracking-luxe text-muted">Щодня 9:00–20:00</p>

            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted md:text-[15px]">
              {content.footer.about}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-muted">
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-ink"
                >
                  <SocialIcon kind="instagram" />
                  <span>{instagramHandle}</span>
                </a>
              )}
              {telegram && (
                <a
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 transition-colors hover:text-ink"
                >
                  <SocialIcon kind="telegram" />
                  <span>{telegramHandle}</span>
                </a>
              )}
              {facebook && (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center transition-colors hover:text-ink"
                >
                  Facebook
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:contents">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-[10px] uppercase tracking-luxe text-ink md:text-[11px]">
                  {col.title}
                </h4>
                <ul className="mt-2 md:mt-4 md:space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        // inline-flex + min-h: на телефоні сам рядок тексту дає
                        // ціль висотою 19px, у яку важко влучити пальцем. На
                        // desktop висота ні на що не впливає — там курсор.
                        className="inline-flex min-h-[34px] items-center text-[13px] text-muted transition-colors hover:text-ink md:min-h-0 md:text-sm"
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
        <div className="wrap flex flex-col gap-3 py-5 text-[10px] uppercase tracking-luxe text-muted md:flex-row md:items-center md:justify-between md:py-6 md:text-[11px]">
          <p className="text-center leading-relaxed sm:text-left">
            © {new Date().getFullYear()} Mania Group · Усі права захищені
          </p>
          {/* inline-flex + min-h — щоб нижній ряд теж був пальцем, а не нігтем:
              самі рядки тут заввишки 15px. На desktop висота знімається. */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 md:justify-end">
            <Link href="/delivery" className="inline-flex min-h-[32px] items-center transition-colors hover:text-ink md:min-h-0">Доставка</Link>
            <Link href="/returns" className="inline-flex min-h-[32px] items-center transition-colors hover:text-ink md:min-h-0">Повернення</Link>
            <Link href="/contacts" className="inline-flex min-h-[32px] items-center transition-colors hover:text-ink md:min-h-0">Контакти</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
