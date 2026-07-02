import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Reveal } from "@/components/Reveal";
import { NewsletterForm } from "@/components/NewsletterForm";
import { ProductRail } from "@/components/ProductRail";
import { CATEGORIES, type Product } from "@/lib/catalog";
import { getProducts, getFeaturedProducts, dbBrands } from "@/lib/productSource";
import { getResolvedBrandLogoMap, resolveBrandLogo } from "@/lib/brandLogos";
import { BrandLogo } from "@/components/BrandLogo";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  let products: Product[] = [];
  try {
    const res = await getProducts({ perPage: 12, orderby: "date", order: "desc" });
    products = res.products;
  } catch {
    products = [];
  }

  const content = await getSiteContent();

  let featured: Product[] = [];
  try { featured = await getFeaturedProducts(12); } catch { featured = []; }

  let brands: { name: string; slug: string }[] = [];
  try { brands = await dbBrands(); } catch { brands = []; }

  let brandLogos: Record<string, string> = {};
  try { brandLogos = await getResolvedBrandLogoMap(); } catch { brandLogos = {}; }

  const hero = brands.length
    ? {
        ...content.hero,
        stats: content.hero.stats.map((s) =>
          /бренд/i.test(s.label)
            ? { ...s, value: `${Math.max(10, Math.floor(brands.length / 10) * 10)}+` }
            : s,
        ),
      }
    : content.hero;

  const sectionMap: Record<string, React.ReactNode> = {
    hero: <Hero hero={hero} />,
    marquee: <BrandStrip brands={brands} logoMap={brandLogos} />,
    categories: <PromoTiles />,
    featured: <ProductRail title="Обране" eyebrow="Кураторський вибір" href="/catalog" products={featured} />,
    newArrivals: <ProductRail title="Нові надходження" eyebrow="Щойно завезли" href="/catalog" products={products} />,
    editorial: <PromoBanner />,
    services: <ServiceRow services={content.services} />,
    newsletter: <Newsletter />,
  };

  const configured = content.homeSections.filter((s) => sectionMap[s.id]);
  const missing = Object.keys(sectionMap)
    .filter((id) => !configured.some((s) => s.id === id))
    .map((id) => ({ id, enabled: true }));
  const order = [...configured, ...missing];

  return (
    <>
      {order
        .filter((s) => s.enabled)
        .map((s) => (
          <React.Fragment key={s.id}>{sectionMap[s.id]}</React.Fragment>
        ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Hero */
// Answear-style: full-bleed campaign photo, bold uppercase sans headline,
// clean CTAs, followed by a thin benefits bar.
function Hero({ hero }: { hero: { eyebrow: string; titleLine1: string; titleAccent: string; subtitle: string; stats: { value: string; label: string }[] } }) {
  return (
    <>
      <section className="relative isolate overflow-hidden" style={{ minHeight: "clamp(440px, 50vw, 580px)" }}>
        <Image
          src="/images/hero.webp"
          alt="Mania Group — нова колекція"
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-20 object-cover object-[60%_top]"
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(95deg, rgba(12,10,8,0.78) 0%, rgba(12,10,8,0.55) 32%, rgba(12,10,8,0.18) 58%, rgba(12,10,8,0.0) 78%)",
          }}
        />

        <div className="wrap relative flex h-full flex-col justify-center py-14 md:py-16">
          <p className="hero-rise text-[11px] font-semibold uppercase tracking-[0.25em] text-paper/70" style={{ animationDelay: "0ms" }}>
            {hero.eyebrow}
          </p>
          <h1 className="hero-rise mt-3 max-w-[16ch] font-sans leading-[0.92] tracking-tight text-paper" style={{ animationDelay: "80ms" }}>
            <span className="block text-[clamp(2.4rem,5.4vw,4.6rem)] font-black uppercase">{hero.titleLine1}</span>
            <span className="block text-[clamp(2.4rem,5.4vw,4.6rem)] font-black uppercase">{hero.titleAccent}</span>
          </h1>
          <p className="hero-rise mt-5 max-w-[40ch] text-[14px] leading-relaxed text-paper/70" style={{ animationDelay: "150ms" }}>
            {hero.subtitle}
          </p>
          <div className="hero-rise mt-10 flex flex-wrap items-center gap-3 md:mt-7" style={{ animationDelay: "220ms" }}>
            <Link href="/catalog" className="inline-flex h-12 items-center bg-paper px-8 text-[12px] font-bold uppercase tracking-[0.14em] text-ink transition-opacity hover:opacity-90">
              До каталогу
            </Link>
            <Link href="/sale" className="inline-flex h-12 items-center bg-[#c1352a] px-8 text-[12px] font-bold uppercase tracking-[0.14em] text-paper transition-opacity hover:opacity-90">
              Sale −50%
            </Link>
          </div>
        </div>
      </section>

      <BenefitsBar />
    </>
  );
}

/* ─────────────────────────────────────────────── Benefits bar */
function BenefitsBar() {
  const items = [
    { t: "Доставка Новою Поштою", s: "по всій Україні", d: "M3 13l1-5h13l3 4v4h-2M5 17H3v-4m2 4a2 2 0 104 0m-4 0a2 2 0 114 0m10 0a2 2 0 11-4 0m4 0a2 2 0 10-4 0m4-4h-5" },
    { t: "100% оригінал", s: "офіційні бренди", d: "M9 12l2 2 4-4m-1.4-5.7a3 3 0 00-3.2 0l-1 .6a3 3 0 01-1.5.4H6a3 3 0 00-3 3v1.4a3 3 0 01-.4 1.5l-.6 1a3 3 0 000 3.2l.6 1a3 3 0 01.4 1.5V18a3 3 0 003 3h1.4a3 3 0 011.5.4l1 .6a3 3 0 003.2 0l1-.6a3 3 0 011.5-.4H18a3 3 0 003-3v-1.4a3 3 0 01.4-1.5l.6-1a3 3 0 000-3.2l-.6-1a3 3 0 01-.4-1.5V6a3 3 0 00-3-3h-1.4a3 3 0 01-1.5-.4z" },
    { t: "Обмін і повернення", s: "протягом 14 днів", d: "M3 12a9 9 0 019-9 9 9 0 016.7 3M21 12a9 9 0 01-9 9 9 9 0 01-6.7-3M21 3v6h-6M3 21v-6h6" },
    { t: "Оплата при отриманні", s: "або онлайн-карткою", d: "M3 10h18M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" },
  ];
  return (
    <div className="border-b border-line bg-white">
      <div className="wrap grid grid-cols-2 gap-x-4 gap-y-4 py-5 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.t} className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 shrink-0 text-ink"><path d={it.d} strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold leading-tight text-ink">{it.t}</p>
              <p className="text-[11px] leading-tight text-muted">{it.s}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────── Promo tiles */
// Answear-style promo grid: two big category tiles + a bold SALE tile.
function PromoTiles() {
  const tiles = [
    { label: CATEGORIES[0]?.label ?? "Жінкам", caption: CATEGORIES[0]?.caption ?? "", href: CATEGORIES[0]?.href ?? "/catalog", image: CATEGORIES[0]?.image ?? "/images/cat-women.webp", dark: false },
    { label: CATEGORIES[1]?.label ?? "Чоловікам", caption: CATEGORIES[1]?.caption ?? "", href: CATEGORIES[1]?.href ?? "/catalog", image: CATEGORIES[1]?.image ?? "/images/cat-men.webp", dark: false },
  ];
  return (
    <section className="wrap py-10 md:py-14">
      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        {tiles.map((t, i) => (
          <Reveal key={t.label} delay={i * 60}>
            <Link href={t.href} className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden md:aspect-[3/4]">
              <Image src={t.image} alt={t.label} fill sizes="(min-width:768px) 33vw, 100vw"
                className="object-cover transition-transform duration-[1100ms] ease-out group-hover:scale-[1.05]" />
              <div className="absolute inset-0" style={{ backgroundImage: t.dark
                ? "linear-gradient(180deg, rgba(193,53,42,0.15) 0%, rgba(120,20,14,0.85) 100%)"
                : "linear-gradient(180deg, rgba(23,19,15,0) 38%, rgba(23,19,15,0.74) 100%)" }} />
              <div className="relative p-6 text-paper md:p-7">
                {t.dark && <span className="mb-2 inline-block bg-paper px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c1352a]">−50%</span>}
                <h3 className="text-[2rem] font-black uppercase leading-none tracking-tight md:text-[2.6rem]">{t.label}</h3>
                {t.caption && <p className="mt-2 text-[12px] text-paper/75">{t.caption}</p>}
                <span className="mt-5 inline-flex h-11 items-center bg-paper px-6 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors group-hover:bg-ink group-hover:text-paper">
                  Переглянути →
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────── Brand strip */
function BrandStrip({ brands, logoMap }: { brands: { name: string; slug: string }[]; logoMap: Record<string, string> }) {
  if (brands.length === 0) return null;
  const byLogoUrl = new Map<string, { name: string; slug: string; logo: string }>();
  for (const b of brands) {
    const logo = resolveBrandLogo(b.name, logoMap);
    if (!logo) continue;
    const existing = byLogoUrl.get(logo);
    if (!existing || b.name.length < existing.name.length) byLogoUrl.set(logo, { ...b, logo });
  }
  const ordered = [...byLogoUrl.values()].slice(0, 18);
  return (
    <section id="brands" className="border-y border-line bg-white py-9 md:py-12">
      <div className="wrap">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-[1.6rem] font-extrabold uppercase leading-none tracking-tight text-ink md:text-[2.1rem]">Бренди</h2>
          <Link href="/brands" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink underline-offset-4 hover:underline">Усі бренди →</Link>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-6">
          {ordered.map((brand, i) => (
            <li key={brand.slug} className={i >= 9 ? "hidden sm:block" : ""}>
              <Link href={`/catalog?brand=${brand.slug}`} aria-label={brand.name} title={brand.name}
                className="flex h-[64px] items-center justify-center border border-line bg-white px-3 transition-all hover:border-ink/30 hover:shadow-[0_2px_12px_-6px_rgba(23,19,15,0.3)] md:h-[76px] md:px-4">
                <BrandLogo name={brand.name} src={brand.logo}
                  imgClass="max-h-[40px] max-w-full object-contain md:max-h-[46px]"
                  textClass="whitespace-nowrap font-display text-[13px] tracking-wide text-ink/65 md:text-[15px]" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── Promo banner */
// Wide full-bleed campaign strip (Answear "shop the collection" banner).
function PromoBanner() {
  return (
    <section id="men" className="wrap py-10 md:py-14">
      <Reveal>
        <Link href="/catalog" className="group relative flex min-h-[300px] items-center overflow-hidden md:min-h-[420px]">
          <Image src="/images/origine-authentic-detail.png" alt="Нова колекція — Mania Group" fill
            sizes="100vw" className="object-cover object-center transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04]" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(12,10,8,0.8) 0%, rgba(12,10,8,0.4) 45%, rgba(12,10,8,0) 75%)" }} />
          <div className="relative max-w-[44ch] px-7 py-12 text-paper md:px-14">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/65">Нова колекція</p>
            <h2 className="mt-3 text-[2.2rem] font-black uppercase leading-[0.9] tracking-tight md:text-[3.4rem]">Сезон<br />оригіналів</h2>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-paper/70">
              Європейські бренди напряму — без реплік, із гарантією та доставкою Новою Поштою.
            </p>
            <span className="mt-7 inline-flex h-12 items-center bg-paper px-8 text-[12px] font-bold uppercase tracking-[0.14em] text-ink transition-colors group-hover:bg-[#c1352a] group-hover:text-paper">
              Дивитись колекцію →
            </span>
          </div>
        </Link>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────────────────────────── Service row */
function ServiceRow({ services }: { services: { title: string; text: string }[] }) {
  return (
    <section id="delivery" className="border-t border-line bg-cloud/40 py-12 md:py-16">
      <div className="wrap">
        <Reveal>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <div key={s.title}>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink">{s.title}</h3>
                <div className="mt-3 h-0.5 w-8 bg-[#c1352a]" />
                <p className="mt-3 text-[13px] leading-[1.7] text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────── Newsletter */
function Newsletter() {
  return (
    <section id="home" className="bg-ink text-paper">
      <div className="wrap">
        <Reveal>
          <div className="flex flex-col items-center py-16 text-center md:flex-row md:justify-between md:py-20 md:text-left">
            <div className="md:max-w-[46%]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/50">−10% на перше замовлення</p>
              <h2 className="mt-3 text-[2rem] font-black uppercase leading-[0.95] tracking-tight md:text-[2.8rem]">
                Підпишись на розсилку
              </h2>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-paper/55">
                Нові надходження, закриті розпродажі та персональні пропозиції — раз на тиждень, без спаму.
              </p>
            </div>
            <div className="mt-8 w-full md:mt-0 md:w-auto md:min-w-[360px]">
              <NewsletterForm source="home" tone="dark" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
