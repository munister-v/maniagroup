import React from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Grain } from "@/components/Grain";
import { NewsletterForm } from "@/components/NewsletterForm";
import { CATEGORIES, BRAND_LOGO_BY_DBNAME, brandsLogoFirst, type Product } from "@/lib/catalog";
import { getProducts, getFeaturedProducts, dbBrands } from "@/lib/productSource";
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

  let featured: Product[] = [];
  try { featured = await getFeaturedProducts(8); } catch { featured = []; }

  let brands: { name: string; slug: string }[] = [];
  try { brands = await dbBrands(); } catch { brands = []; }

  // Keep the hero "брендів" stat truthful: replace its value with the live
  // brand count (rounded down to a tidy 10), leaving the admin's other stats.
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
    marquee: <BrandMarquee brands={brands} />,
    categories: <CategoryTrio />,
    featured: <Featured products={featured} />,
    newArrivals: <NewArrivals products={products} />,
    editorial: <Editorial />,
    services: <ServiceRow services={content.services} />,
    newsletter: <Newsletter />,
  };

  // Render in admin-configured order; append any sections missing from the
  // saved config (e.g. newly added) so nothing silently disappears.
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

/* ───────────────────────────────────────────────── Brand strip */
// Static (non-scrolling) strip of every brand in the catalog, logos first.
function BrandMarquee({ brands }: { brands: { name: string; slug: string }[] }) {
  if (brands.length === 0) return null;
  // Logos first, then most-stocked brands; cap so the static strip stays tidy.
  // The full list lives in the header «Бренди» menu and the catalog.
  const ordered = brandsLogoFirst(brands).slice(0, 18);
  return (
    <section id="brands" className="border-y border-line py-9 md:py-11">
      <div className="wrap">
        <div className="mb-7 text-center">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Наші бренди</p>
          <h2 className="mt-2 font-display text-2xl text-ink md:text-3xl">
            Європейські марки в одному місці
          </h2>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-5 md:gap-x-12">
          {ordered.map((brand) => {
            const logo = BRAND_LOGO_BY_DBNAME[brand.name];
            return (
              <li key={brand.slug}>
                <Link
                  href={`/catalog?brand=${brand.slug}`}
                  aria-label={brand.name}
                  className="flex items-center"
                >
                  {logo ? (
                    <Image
                      src={logo}
                      alt={brand.name}
                      width={150}
                      height={40}
                      className="h-7 w-auto max-w-[140px] object-contain opacity-60 transition-opacity hover:opacity-100 md:h-8"
                    />
                  ) : (
                    <span className="whitespace-nowrap font-display text-lg tracking-wide text-ink/55 transition-colors hover:text-ink md:text-xl">
                      {brand.name}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
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
function Featured({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section className="wrap pb-16 md:pb-24">
      <Reveal>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Кураторський вибір</p>
            <h2 className="mt-2 font-display text-3xl text-ink md:text-4xl">Обране</h2>
          </div>
          <Link href="/catalog" className="link-underline hidden text-[12px] uppercase tracking-luxe text-ink sm:block">
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
