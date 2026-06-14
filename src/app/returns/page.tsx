import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  title: "Обмін і повернення — Mania Group",
  description: "14 днів на обмін або повернення. Умови та порядок оформлення в Mania Group.",
};

export default async function ReturnsPage() {
  const { returns, contacts } = await getSiteContent();

  return (
    <div>
      <div className="border-b border-line bg-cloud/40">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / Обмін і повернення
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink md:text-5xl lg:text-6xl">Обмін і повернення</h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted"
            dangerouslySetInnerHTML={{ __html: returns.subtitle.replace("14 днів", "<strong class=\"text-ink\">14 днів</strong>") }} />
        </div>
      </div>

      <section className="wrap py-14 md:py-20">
        <Reveal>
          <p className="text-[11px] uppercase tracking-luxe text-muted">Як оформити</p>
          <h2 className="mt-3 font-display text-3xl text-ink">Три кроки</h2>
        </Reveal>
        <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
          {returns.steps.map((s, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="flex h-full flex-col bg-paper p-8 md:p-10">
                <span className="font-display text-4xl text-line">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 text-[12px] uppercase tracking-luxe text-ink">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-14 md:py-20">
          <Reveal>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Умови</p>
            <h2 className="mt-3 font-display text-3xl text-ink">Що потрібно зберегти</h2>
          </Reveal>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {returns.conditions.map((c, i) => (
              <Reveal key={i} delay={i * 40}>
                <li className="flex items-start gap-5 py-5">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/30" />
                  <span className="text-sm leading-relaxed text-muted">{c}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line bg-ink text-paper">
        <div className="wrap py-14 md:py-20">
          <Reveal>
            <div className="grid gap-8 md:grid-cols-2 md:items-end">
              <div>
                <p className="text-[11px] uppercase tracking-luxe text-paper/50">Важливо знати</p>
                <h2 className="mt-3 font-display text-3xl">{returns.guaranteeTitle}</h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/70">{returns.guaranteeText}</p>
              </div>
              <div className="flex flex-col gap-3 md:items-end">
                {contacts.phone && (
                  <a href={`tel:${contacts.phone.replace(/\s/g, "")}`}
                    className="inline-flex h-12 items-center bg-paper px-8 text-[12px] uppercase tracking-luxe text-ink transition-opacity hover:opacity-85">
                    {contacts.phone}
                  </a>
                )}
                <Link href="/contacts"
                  className="inline-flex h-12 items-center border border-paper/40 px-8 text-[12px] uppercase tracking-luxe text-paper transition-colors hover:border-paper">
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
