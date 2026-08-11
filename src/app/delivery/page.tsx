import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  title: "Доставка та оплата",
  alternates: { canonical: "/delivery" },
  description: "Безкоштовна доставка Новою Поштою від 3 000 ₴. Оплата при отриманні по всій Україні.",
};

export default async function DeliveryPage() {
  const { delivery, contacts } = await getSiteContent();

  return (
    <div>
      <div className="border-b border-line bg-cloud/40">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / Доставка та оплата
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink md:text-5xl lg:text-6xl">Доставка та оплата</h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">{delivery.subtitle}</p>

          {/* Три відповіді, по які сюди й заходять, — одразу, без гортання до
              карток. «Скільки чекати», «скільки коштує», «коли платити». */}
          <dl className="mt-9 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-5 border-t border-line pt-7 sm:grid-cols-3">
            {[
              { k: "Відправка", v: "1–2 робочі дні" },
              { k: "Безкоштовно від", v: "3 000 ₴" },
              { k: "Оплата", v: "При отриманні" },
            ].map((x) => (
              <div key={x.k}>
                <dt className="text-[10px] uppercase tracking-luxe text-muted">{x.k}</dt>
                <dd className="mt-1.5 font-display text-xl text-ink md:text-2xl">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Було: чотири однакові прямокутники в рамці 2×2 — сітка з нічого, яка
          читається як таблиця, а не як розповідь. Тепер нумерований перелік із
          тонкими лініями: та сама мова, що й у блоці переваг на головній. */}
      <section className="wrap py-14 md:py-20">
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {delivery.cards.map((c, i) => (
            <Reveal key={i} delay={i * 60}>
              <div className="border-t border-line pt-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-base leading-none text-ink/25">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[10px] uppercase tracking-luxe text-muted">{c.eyebrow}</p>
                </div>
                <h2 className="mt-3 font-display text-2xl text-ink md:text-[1.7rem]">{c.title}</h2>
                <p className="mt-3 max-w-md text-sm leading-[1.75] text-muted">{c.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-14 md:py-20">
          <Reveal>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Оплата</p>
            <h2 className="mt-3 font-display text-3xl text-ink md:text-4xl">Зручно та безпечно</h2>
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <Reveal delay={60}>
              <div className="border border-line p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-luxe text-muted">Доступно зараз</p>
                    <h3 className="mt-2 font-display text-xl text-ink">Накладений платіж</h3>
                  </div>
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#4a8a4a]" />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{delivery.paymentNote}</p>
                <p className="mt-3 text-xs uppercase tracking-luxe text-muted">Комісія Нової Пошти: 2% від суми замовлення</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="border border-line/50 bg-cloud/30 p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-luxe text-muted">Незабаром</p>
                    <h3 className="mt-2 font-display text-xl text-ink/50">Онлайн-оплата карткою</h3>
                  </div>
                  <span className="mt-1 h-2 w-2 rounded-full bg-line" />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted/60">Visa, Mastercard. Оплата прямо на сайті з&apos;явиться найближчим часом.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {delivery.faq.length > 0 && (
        <section className="border-t border-line">
          <div className="wrap py-14 md:py-20">
            <Reveal>
              <p className="text-[11px] uppercase tracking-luxe text-muted">Часті питання</p>
            </Reveal>
            <dl className="mt-8 divide-y divide-line">
              {delivery.faq.map((item, i) => (
                <Reveal key={i} delay={i * 40}>
                  <div className="grid gap-2 py-6 md:grid-cols-2 md:gap-12">
                    <dt className="text-sm font-medium text-ink">{item.q}</dt>
                    <dd className="text-sm leading-relaxed text-muted">{item.a}</dd>
                  </div>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>
      )}

      <section className="border-t border-line">
        <div className="wrap py-12 md:py-16">
          <Reveal>
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-luxe text-muted">Залишились питання?</p>
                <p className="mt-1 font-display text-2xl text-ink">{delivery.ctaTitle}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {contacts.phone && (
                  <a href={`tel:${contacts.phone.replace(/\s/g, "")}`}
                    className="inline-flex h-12 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85">
                    {contacts.phone}
                  </a>
                )}
                <Link href="/contacts"
                  className="inline-flex h-12 items-center border border-line px-8 text-[12px] uppercase tracking-luxe text-ink transition-colors hover:border-ink">
                  Усі контакти →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
