import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  title: "Контакти — Mania Group",
  description: "Телефон, Instagram та e-mail Mania Group. Відповідаємо щодня з 9:00 до 20:00.",
};

export default async function ContactsPage() {
  const { phone, email, instagram, facebook } = (await getSiteContent()).contacts;

  return (
    <div>
      {/* Hero */}
      <div className="border-b border-line bg-cloud/40">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / Контакти
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink md:text-5xl lg:text-6xl">
            Контакти
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Відповідаємо на дзвінки та повідомлення щодня з 9:00 до 20:00.
          </p>
        </div>
      </div>

      {/* Contact blocks */}
      <section className="wrap py-14 md:py-20">
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {phone && (
            <Reveal>
              <div className="flex flex-col bg-paper p-8 md:p-10">
                <p className="text-[11px] uppercase tracking-luxe text-muted">Телефон</p>
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="mt-3 font-display text-2xl text-ink transition-opacity hover:opacity-60"
                >
                  {phone}
                </a>
                <p className="mt-3 text-sm text-muted">Щодня · 9:00 — 20:00</p>
                <p className="mt-1 text-xs text-muted/70">
                  Дзвінки, Viber, WhatsApp
                </p>
              </div>
            </Reveal>
          )}

          {instagram && (
            <Reveal delay={60}>
              <a
                href={instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col bg-paper p-8 transition-colors hover:bg-cloud/60 md:p-10"
              >
                <p className="text-[11px] uppercase tracking-luxe text-muted">Instagram</p>
                <span className="mt-3 font-display text-2xl text-ink group-hover:opacity-70">
                  @maniagroup.ua
                </span>
                <p className="mt-3 text-sm text-muted">
                  Нові надходження, lookbook та відповіді у Direct
                </p>
                <span className="mt-4 text-[11px] uppercase tracking-luxe text-ink/50 transition-colors group-hover:text-ink">
                  Перейти →
                </span>
              </a>
            </Reveal>
          )}

          {email && (
            <Reveal delay={120}>
              <div className="flex flex-col bg-paper p-8 md:p-10">
                <p className="text-[11px] uppercase tracking-luxe text-muted">E-mail</p>
                <a
                  href={`mailto:${email}`}
                  className="mt-3 font-display text-xl text-ink transition-opacity hover:opacity-60 break-all"
                >
                  {email}
                </a>
                <p className="mt-3 text-sm text-muted">
                  Для ділових питань та запитів від брендів
                </p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* Telegram */}
      <section className="border-t border-line">
        <div className="wrap py-14 md:py-20">
          <Reveal>
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-luxe text-muted">Telegram-канал</p>
                <h2 className="mt-3 font-display text-3xl text-ink">
                  Новинки першими
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  Підписуйтесь на наш Telegram — анонси надходжень, приватні розпродажі та
                  знижки для підписників до будь-яких оголошень в Instagram.
                </p>
                <a
                  href="https://t.me/maniagroup_ua"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex h-12 items-center border border-ink px-8 text-[12px] uppercase tracking-luxe text-ink transition-colors hover:bg-ink hover:text-paper"
                >
                  Підписатись →
                </a>
              </div>
              <div className="hidden border border-line bg-cloud/40 p-12 md:flex md:flex-col md:items-center md:justify-center">
                <span className="font-display text-5xl text-ink/20">t.me</span>
                <span className="mt-2 text-[11px] uppercase tracking-luxe text-muted">@maniagroup_ua</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Info row */}
      <section className="border-t border-line bg-cloud/30">
        <div className="wrap py-10">
          <Reveal>
            <div className="flex flex-wrap gap-8 text-sm text-muted">
              <div>
                <span className="text-[11px] uppercase tracking-luxe">Доставка</span>
                <p className="mt-1">Нова Пошта · по всій Україні</p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-luxe">Оплата</span>
                <p className="mt-1">Накладений платіж при отриманні</p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-luxe">Повернення</span>
                <p className="mt-1">14 днів з дня отримання</p>
              </div>
              <div className="md:ml-auto">
                <Link href="/delivery" className="link-underline text-[11px] uppercase tracking-luxe text-ink">
                  Умови доставки →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
