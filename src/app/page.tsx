import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { Grain } from "@/components/Grain";
import { BRANDS, CATEGORIES, fromWcProduct, type Product } from "@/lib/catalog";
import { fetchProducts } from "@/lib/wc";
import { getSiteContent, type SiteContent } from "@/lib/siteContent";

export default async function Home() {
  let products: Product[] = [];
  try {
    const wcProducts = await fetchProducts({ perPage: 8, orderby: "date" });
    products = wcProducts.map(fromWcProduct);
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
      <Journal entries={content.journal} />
      <ServiceRow />
      <Newsletter />
    </>
  );
}

/* ─────────────────────────────────────────────────────────── Hero */
function Hero({ hero }: { hero: SiteContent["hero"] }) {
  return (
    <section className="relative isolate -mt-16 overflow-hidden bg-ink text-paper md:-mt-20">
      <div
        className="absolute inset-0 -z-10 animate-drift"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 80% 8%, rgba(201,189,171,0.34), transparent 55%), radial-gradient(90% 80% at 8% 92%, rgba(122,92,62,0.36), transparent 55%), linear-gradient(150deg, #1c1712 0%, #241d17 50%, #15110d 100%)",
        }}
      />
      <Grain variant="strong" />

      <div className="wrap relative flex min-h-[88vh] flex-col justify-center py-28">
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
            href="#women"
            className="inline-flex h-12 items-center bg-paper px-8 text-[12px] uppercase tracking-luxe text-ink transition-opacity hover:opacity-85"
          >
            Перейти до каталогу
          </Link>
          <Link
            href="#brands"
            className="link-underline text-[12px] uppercase tracking-luxe text-paper"
          >
            Усі бренди →
          </Link>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
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
        <div className="flex w-max animate-marquee">
          {row.map((brand, i) => (
            <span
              key={i}
              className="mx-9 whitespace-nowrap font-display text-xl tracking-wide text-ink/70 md:text-2xl"
            >
              {brand}
            </span>
          ))}
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
              className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden p-7 md:aspect-[4/5]"
            >
              <div
                className="absolute inset-0 transition-transform duration-[1300ms] ease-out group-hover:scale-105"
                style={{
                  backgroundColor: cat.tone,
                  backgroundImage:
                    "linear-gradient(180deg, rgba(255,255,255,0) 35%, rgba(23,19,15,0.46) 100%)",
                }}
              />
              <Grain />
              <div className="pointer-events-none absolute inset-4 border border-paper/15" />
              <div className="relative text-paper">
                <h3 className="font-display text-2xl md:text-3xl">{cat.label}</h3>
                <p className="mt-1.5 text-[12px] uppercase tracking-luxe text-paper/85">
                  {cat.caption}
                </p>
                <span className="mt-4 inline-block text-[11px] uppercase tracking-luxe text-paper underline-offset-4 group-hover:underline">
                  Дивитися →
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
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: "#b9ae9b",
                backgroundImage:
                  "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), transparent 55%), linear-gradient(160deg, rgba(23,19,15,0) 50%, rgba(23,19,15,0.4) 100%)",
              }}
            />
            <Grain variant="strong" />
            <span className="absolute bottom-6 left-7 font-display text-6xl leading-none text-ink/15">
              Origine
            </span>
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
              href="#"
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

/* ─────────────────────────────────────────────────── Journal */
function Journal({ entries }: { entries: SiteContent["journal"] }) {
  return (
    <section className="wrap py-16 md:py-24">
      <Reveal>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">
              Stories
            </p>
            <h2 className="mt-2 font-display text-3xl text-ink md:text-4xl">
              Журнал
            </h2>
          </div>
          <Link
            href="#"
            className="link-underline hidden text-[12px] uppercase tracking-luxe text-ink sm:block"
          >
            Усі статті →
          </Link>
        </div>
      </Reveal>

      <div className="grid gap-5 md:grid-cols-3">
        {entries.map((article, i) => (
          <Reveal key={article.id} delay={i * 80}>
            <Link href="#" className="group block">
              <div className="relative aspect-[4/5] overflow-hidden">
                <div
                  className="absolute inset-0 transition-transform duration-[1300ms] ease-out group-hover:scale-105"
                  style={{
                    backgroundColor: article.tone,
                    backgroundImage:
                      "linear-gradient(180deg, rgba(255,255,255,0) 28%, rgba(23,19,15,0.52) 100%)",
                  }}
                />
                <Grain />
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-paper">
                  <span className="text-[10px] uppercase tracking-luxe text-paper/75">
                    {article.kicker} · {article.read}
                  </span>
                  <h3 className="mt-2 max-w-[22ch] font-display text-xl leading-snug">
                    {article.title}
                  </h3>
                  <span className="mt-3 text-[11px] uppercase tracking-luxe text-paper underline-offset-4 group-hover:underline">
                    Читати →
                  </span>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────── Service row */
const SERVICES: { title: string; text: string }[] = [
  { title: "Тільки оригінал", text: "Прямі поставки від брендів та офіційних дистриб’юторів" },
  { title: "Доставка по Україні", text: "Новою Поштою — безкоштовно від 3 000 ₴" },
  { title: "Обмін і повернення", text: "14 днів, щоб ухвалити рішення" },
  { title: "Підтримка щодня", text: "+38 (096) 343-60-35 · 9:00–20:00" },
];

function ServiceRow() {
  return (
    <section id="delivery" className="wrap py-16 md:py-20">
      <Reveal>
        <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
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
          <form className="mt-8 flex w-full max-w-md items-center gap-2">
            <input
              type="email"
              required
              placeholder="Ваш e-mail"
              className="h-12 flex-1 border border-line bg-white px-4 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 bg-ink px-6 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
            >
              Підписатись
            </button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Підписуючись, ви погоджуєтесь з політикою конфіденційності.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
