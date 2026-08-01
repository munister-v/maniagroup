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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:block">
              <div>
                <p className="text-[10px] uppercase tracking-[0.26em] text-muted">Official contacts</p>
                <p className="mt-3 font-display text-xl tracking-wordmark text-ink md:text-2xl">
                  MANIA&nbsp;GROUP
                </p>
              </div>
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line px-4 py-3 text-center text-[13px] tracking-[0.14em] text-ink transition-colors hover:border-ink hover:bg-cloud/60 sm:w-auto sm:justify-start sm:text-left"
                >
                  {phone}
                </a>
              )}
            </div>
            <div className="mt-5 space-y-4">
              <p className="max-w-sm text-sm leading-relaxed text-muted md:text-[15px]">
                {content.footer.about}
              </p>
              <div className="flex flex-wrap gap-2.5 text-[11px] uppercase tracking-[0.16em] text-muted">
                {instagram && (
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 py-2.5 transition-colors hover:border-ink hover:bg-cloud/60 hover:text-ink"
                  >
                    <SocialIcon kind="instagram" />
                    <span>Instagram · {instagramHandle}</span>
                  </a>
                )}
                {telegram && (
                  <a
                    href={telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 py-2.5 transition-colors hover:border-ink hover:bg-cloud/60 hover:text-ink"
                  >
                    <SocialIcon kind="telegram" />
                    <span>Telegram · {telegramHandle}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:contents">
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
        <div className="wrap flex flex-col gap-4 py-5 text-[10px] uppercase tracking-luxe text-muted md:flex-row md:items-center md:justify-between md:py-6 md:text-[11px]">
          <p className="max-w-[24rem] text-center leading-relaxed sm:text-left">© {new Date().getFullYear()} Mania Group · Усі права захищені</p>
          <div className="flex w-full flex-wrap items-center justify-center gap-2.5 sm:justify-start md:w-auto md:justify-end">
            <a
              href={instagram || "https://instagram.com/mania.group"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 py-2 transition-colors hover:border-ink hover:bg-cloud/60 hover:text-ink"
            >
              <SocialIcon kind="instagram" />
              Instagram
            </a>
            <a
              href={telegram || "https://t.me/ManiaGroupKiev"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-3 py-2 transition-colors hover:border-ink hover:bg-cloud/60 hover:text-ink"
            >
              <SocialIcon kind="telegram" />
              Telegram
            </a>
            {facebook && (
              <a href={facebook} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-full border border-line px-3 py-2 transition-colors hover:border-ink hover:bg-cloud/60 hover:text-ink">
                Facebook
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
