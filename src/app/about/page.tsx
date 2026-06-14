import Link from "next/link";
import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { Grain } from "@/components/Grain";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  title: "Про Mania Group — Оригінальний брендовий одяг",
  description: "Mania Group — офіційний імпортер EA7, Moschino, Antony Morato, Harmont & Blaine, MC2 Saint Barth та інших брендів в Україні.",
};

const BRANDS = [
  "EA7 Emporio Armani", "Moschino", "Antony Morato", "Harmont & Blaine",
  "MC2 Saint Barth", "Fred Mello", "J.B4", "Kocca",
];

export default async function AboutPage() {
  const { about } = await getSiteContent();

  return (
    <div>
      <div className="relative isolate overflow-hidden bg-ink text-paper">
        <Image
          src="/images/origine-authentic-detail.png"
          alt="Mania Group"
          fill priority sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-center opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 to-ink/40" />
        <Grain variant="strong" />
        <div className="wrap py-20 md:py-28">
          <Reveal>
            <p className="text-[11px] uppercase tracking-luxe text-paper/50">
              <Link href="/" className="hover:text-paper/80">Головна</Link> / Про нас
            </p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl leading-tight md:text-6xl">
              {about.heroTitle.split("—").map((part, i, arr) =>
                i < arr.length - 1
                  ? <span key={i}>{part}—</span>
                  : <span key={i} className="italic text-[#d8c7a8]">{part}</span>
              )}
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-paper/70">{about.heroSubtitle}</p>
          </Reveal>
        </div>
      </div>

      <section className="wrap py-16 md:py-24">
        <Reveal>
          <p className="text-[11px] uppercase tracking-luxe text-muted">Наші принципи</p>
          <h2 className="mt-3 font-display text-3xl text-ink md:text-4xl">Чому обирають нас</h2>
        </Reveal>
        <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {about.values.map((v, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="bg-paper p-8 md:p-10">
                <h3 className="text-[12px] uppercase tracking-luxe text-ink">{v.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{v.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-ink text-paper">
        <div className="wrap py-16 md:py-24">
          <Reveal>
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <div>
                <p className="text-[11px] uppercase tracking-luxe text-paper/50">Гарантія оригіналу</p>
                <h2 className="mt-4 font-display text-3xl leading-snug md:text-4xl">Автентичність — наша репутація</h2>
                <p className="mt-5 text-sm leading-relaxed text-paper/70">{about.story}</p>
                <p className="mt-4 text-sm leading-relaxed text-paper/70">{about.guaranteeText}</p>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden border border-paper/10 bg-paper/10">
                {["Документи\nпроходження", "Гарантія\nвиробника", "Перевірка\nперед відправкою", "Повернення\nбез питань"].map((t, i) => (
                  <div key={i} className="bg-ink p-6">
                    <span className="font-display text-3xl text-paper/15">{String(i + 1).padStart(2, "0")}</span>
                    <p className="mt-2 whitespace-pre-line text-[11px] uppercase tracking-luxe text-paper/60">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="wrap py-16 md:py-24">
          <Reveal>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Бренди в нашому портфелі</p>
            <h2 className="mt-3 font-display text-3xl text-ink md:text-4xl">Що ми пропонуємо</h2>
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 md:grid-cols-4">
            {BRANDS.map((b, i) => (
              <Reveal key={b} delay={i * 50}>
                <Link href="/catalog" className="group flex items-center bg-paper px-6 py-5 transition-colors hover:bg-cloud/60">
                  <span className="text-sm text-ink/70 transition-colors group-hover:text-ink">{b}</span>
                  <span className="ml-auto text-ink/20 transition-colors group-hover:text-ink">→</span>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="mt-8 flex gap-4">
              <Link href="/catalog" className="inline-flex h-12 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85">
                Перейти до каталогу →
              </Link>
              <Link href="/contacts" className="inline-flex h-12 items-center border border-line px-8 text-[12px] uppercase tracking-luxe text-ink transition-colors hover:border-ink">
                Зв'язатися
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
