import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Grain } from "@/components/Grain";
import { NewsletterForm } from "@/components/NewsletterForm";
import { BRANDS, BRAND_LOGOS, brandHref, CATEGORIES, type Product } from "@/lib/catalog";
import { getProducts } from "@/lib/productSource";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  let products: Product[] = [];
  try {
    const res = await getProducts({ perPage: 8, orderby: "date", order: "desc" });
    products = res.products;
  } catch {
    products = [];
  }

  const content = await getSiteContent();

  return (
    <>
      <Hero hero={content.hero} />
      <BrandMarquee />
      <CategoryTrio />
      <NewArrivals products={products} />
      <Editorial />
      <ServiceRow services={content.services} />
      <Newsletter />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Hero */
function Hero({ hero }: { hero: { eyebrow: string; titleLine1: string; titleAccent: string; subtitle: string; stats: { value: string; label: string }[] } }) {
  return (
    <section className="relative isolate -mt-16 overflow-hidden bg-ink text-paper md:-mt-[120px]">
      <Image
        src="/images/hero.webp"
        alt="Mania Group — нова колекція"
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 -z-20 object-cover object-center"
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(18,14,10,0.92) 0%, rgba(18,14,10,0.62) 38%, rgba(18,14,10,0.18) 70%, rgba(18,14,10,0.45) 100%)",
        }}
      />
      <Grain variant="strong" />

      <div className="wrap relative flex min-h-[88vh] flex-col justify-center py-20 md:py-28">
        <p
          className="hero-rise text-[11px] uppercase tracking-luxe text-paper/55"
          style={{ animationDelay: "0ms" }}
        >
          {hero.eyebrow}
        </p>
        <h1
          className="hero-rise mt-6 max-w-[15ch] font-display text-[clamp(2.8rem,8vw,7rem)] font-semibold leading-[0.93] tracking-tight"
          style={{ animationDelay: "90ms" }}
        >
          {hero.titleLine1}{" "}
          <span className="italic text-[#d8c7a8]">{hero.titleAccent}</span>
        </h1>
        <p
          className="hero-rise mt-7 max-w-md text-base leading-relaxed text-paper/70"
          style={{ animationDelay: "180ms" }}
        >
          {hero.subtitle}
        </p>
        <div
          className="hero-rise mt-9 flex flex-wrap items-center gap-5"
          style={{ animationDelay: "270ms" }}
        >
          <Link
            href="/catalog"
            className="inline-flex h-12 items-center bg-paper px-8 text-[12px] uppercase tracking-luxe text-ink transition-opacity hover:opacity-85"
          >
            Перейти до каталогу
          </Link>
          <Link
            href="/catalog"
            className="link-underline text-[12px] uppercase tracking-luxe text-paper"
          >
            Усі бренди →
          </Link>
        </div>
        <dl
          className="hero-rise mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-paper/15 pt-6 md:mt-12 md:gap-6"
          style={{ animationDelay: "340ms" }}
        >
          {hero.stats.map((s) => (
            <div key={s.label}>
              <dt className="font-display text-2xl text-paper md:text-3xl">{s.value}</dt>
              <dd className="mt-1 whitespace-nowrap text-[10px] uppercase tracking-luxe text-paper/55">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center md:flex">
        <span className="text-[10px] uppercase tracking-luxe text-paper/45">
          Гортайте ↓
        </span>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────── Brand marquee */
function BrandMarquee() {
  const row = [...BRANDS, ...BRANDS];
  return (
    <section id="brands" className="border-y border-line py-7">
      <div className="relative overflow-hidden">
        <div className="flex w-max items-center animate-marquee">
          {row.map((brand, i) => {
            const logo = BRAND_LOGOS[brand];
            return (
              <Link
                key={i}
                href={brandHref(brand)}
                aria-label={brand}
                className="mx-9 flex shrink-0 items-center"
              >
                {logo ? (
                  <Image
                    src={logo}
                    alt={brand}
                    width={150}
                    height={40}
                    className="h-7 w-auto max-w-[150px] object-contain opacity-55 transition-opacity hover:opacity-100 md:h-9"
                  />
                ) : (
                  <span className="whitespace-nowrap font-display text-xl tracking-wide text-ink/55 transition-colors hover:text-ink md:text-2xl">
                    {brand}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent" />
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────── Category trio */
function CategoryTrio() {
  return (
    <section className="wrap py-16 md:py-24">
      <div className="grid gap-4 md:grid-cols-3">
        {CATEGORIES.map((cat, i) => (
          <Reveal key={cat.href} delay={i * 80}>
            <Link
              href={cat.href}
              style={{ backgroundColor: cat.tone }}
              className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden p-7 md:aspect-[4/5]"
            >
              <Image
                src={cat.image}
                alt={cat.label}
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                className="object-cover transition-transform duration-[1300ms] ease-out group-hover:scale-105"
              />
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, rgba(23,19,15,0) 28%, rgba(23,19,15,0.66) 100%)",
                }}
              />
              <Grain />
              <div className="pointer-events-none absolute inset-4 border border-paper/15" />
              <div className="relative text-paper">
                <h3 className="font-display text-3xl md:text-4xl">{cat.label}</h3>
                <p className="mt-1.5 text-[12px] uppercase tracking-luxe text-paper/85">
                  {cat.caption}
                </p>
                <span className="mt-5 inline-flex h-11 items-center bg-paper px-6 text-[11px] uppercase tracking-luxe text-ink transition-opacity group-hover:opacity-85">
                  Дивитися каталог →
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────── New arrivals */
function NewArrivals({ products }: { products: Product[] }) {
  return (
    <section id="women" className="wrap pb-16 md:pb-24">
      <Reveal>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">
              Щойно завезли
            </p>
            <h2 className="mt-2 font-display text-3xl text-ink md:text-4xl">
              Нові надходження
            </h2>
          </div>
          <Link
            href="/catalog"
            className="link-underline hidden text-[12px] uppercase tracking-luxe text-ink sm:block"
          >
            Дивитися все →
          </Link>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product, i) => (
          <Reveal key={product.id} delay={(i % 4) * 70}>
            <ProductCard product={product} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── Editorial */
function Editorial() {
  return (
    <section id="men" className="wrap py-8">
      <Reveal>
        <div className="grid items-center gap-8 overflow-hidden bg-ink text-paper md:grid-cols-2">
          <div className="relative min-h-[320px] md:min-h-[480px]">
            <Image
              src="/images/origine-authentic-detail.png"
              alt="Оригінальна деталь — Mania Group"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(160deg, rgba(23,19,15,0) 50%, rgba(23,19,15,0.35) 100%)",
              }}
            />
          </div>
          <div className="px-8 py-12 md:px-12 md:py-16">
            <p className="text-[11px] uppercase tracking-luxe text-paper/60">
              Чому Mania Group
            </p>
            <h2 className="mt-4 font-display text-3xl leading-snug md:text-[2.6rem]">
              Кожна деталь —<br />оригінал
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-paper/75">
              Ми працюємо напряму з європейськими брендами та офіційними
              дистриб&rsquo;юторами. Жодних реплік — лише автентичні речі з повним
              пакетом гарантій, дбайливою упаковкою та доставкою Новою Поштою.
            </p>
            <Link
              href="/about"
              className="mt-8 inline-flex h-12 items-center border border-paper/40 px-8 text-[12px] uppercase tracking-luxe text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              Про нас
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────────────────────────── Service row */
function ServiceRow({ services }: { services: { title: string; text: string }[] }) {
  return (
    <section id="delivery" className="wrap py-16 md:py-20">
      <Reveal>
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <div key={s.title} className="bg-paper p-7">
              <h3 className="text-[12px] uppercase tracking-luxe text-ink">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ─────────────────────────────────────────────── Newsletter */
function Newsletter() {
  return (
    <section id="home" className="wrap">
      <Reveal>
        <div className="flex flex-col items-center border-t border-line py-16 text-center md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            Lookbook &amp; приватні розпродажі
          </p>
          <h2 className="mt-3 max-w-xl font-display text-3xl text-ink md:text-4xl">
            Першими дізнавайтесь про нові надходження
          </h2>
          <div className="mt-8 flex w-full justify-center">
            <NewsletterForm source="home" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
