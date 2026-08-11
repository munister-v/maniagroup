import Link from "next/link";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { CatalogFilters, type Facets } from "@/components/CatalogFilters";
import { ActiveFilterChips } from "@/components/ActiveFilterChips";
import { CatalogSort } from "@/components/CatalogSort";
import { getCatalogProducts, getCatalogCategories, dbSizeFacets, dbBrands, dbColorFacets, dbSeasonFacets, dbPriceRange, resolveBrandSlugs } from "@/lib/productSource";
import { resolveCatalogCategory } from "@/lib/categoryAliases";
import { SITE_URL } from "@/lib/siteUrl";

/** React-cache: generateMetadata і сам рендер сторінки виконуються в одному
 *  запиті, і без цього кожен із них ходив би в базу за тим самим списком. */
const cachedCategories = cache(getCatalogCategories);
const cachedBrandNames = cache(resolveBrandSlugs);

/**
 * Фільтри каталогу — це, по суті, окремі посадкові сторінки: /catalog?brand=prada
 * і /catalog?category=sukni мають різний зміст. Раніше всі вони віддавали один
 * заголовок «Каталог» і canonical на голий /catalog, тобто для пошуку 76 брендів
 * і всі категорії просто не існували.
 *
 * Тепер: заголовок і опис збираються з активних фільтрів (той самий текст, що і
 * в H1), canonical лишає в собі ЛИШЕ змістовні параметри — категорію, бренд,
 * стать, знижку. Сортування, сторінка, ціна, колір, розмір, пошуковий запит з
 * canonical випадають: вони не створюють нової сторінки, а лише переставляють ту
 * саму добірку, і кожна така комбінація інакше плодила б дубль.
 */
const MEANINGFUL: (keyof CatalogParams)[] = ["category", "gender", "brand", "sale"];

type CatalogParams = {
  category?: string; brand?: string; brands?: string; brandGroup?: string;
  gender?: string; color?: string; colors?: string; inStock?: string;
  sale?: string; q?: string; sort?: string; size?: string; sizes?: string;
  seasons?: string; min?: string; max?: string; page?: string;
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<CatalogParams> }): Promise<Metadata> {
  const sp = await searchParams;
  const { category: categorySlug, gender } = resolveCatalogCategory(sp.category, sp.gender);
  const brandSlugs = Array.from(new Set([...parseList(sp.brands), ...(sp.brand ? [sp.brand] : [])]));

  const [categories, brandNames] = await Promise.all([
    cachedCategories().catch(() => []),
    cachedBrandNames(brandSlugs).catch(() => [] as string[]),
  ]);

  const categoryName = categories.find((c) => c.slug === categorySlug)?.name;
  const genderLabel = GENDERS.find((g) => g.slug === gender)?.label;
  const brandName = brandNames.length === 1 ? brandNames[0] : undefined;

  // Той самий порядок пріоритетів, що й у видимого H1 нижче — вкладка й
  // заголовок сторінки не повинні розходитись.
  const heading =
    brandName ??
    (sp.brandGroup ? sp.brandGroup.charAt(0).toUpperCase() + sp.brandGroup.slice(1) : undefined) ??
    categoryName ??
    genderLabel ??
    (sp.sale === "1" ? "Знижки" : undefined) ??
    (sp.q ? `Пошук: ${sp.q}` : "Каталог");

  // «Жіночі сукні PRADA» читається краще за просто «Сукні», і саме так люди шукають.
  const parts = [brandName, categoryName ?? genderLabel].filter(Boolean);
  const title = parts.length === 2 ? `${parts[1]} ${parts[0]}` : heading;

  const description = brandName
    ? `${brandName} — оригінал в Україні. ${categoryName ? categoryName + ", " : ""}актуальна колекція, доставка Новою Поштою, обмін 14 днів.`
    : categoryName || genderLabel
      ? `${categoryName ?? genderLabel} від європейських брендів. Оригінал, фільтри за розміром, кольором і ціною, доставка по всій Україні.`
      : "Каталог брендового одягу, взуття та аксесуарів. Оригінал від офіційних дистриб'юторів, фільтри за брендом, розміром, кольором і ціною.";

  // Canonical збираємо руками, а не з усього sp: порядок параметрів має бути
  // стабільним, інакше ?brand=x&category=y і ?category=y&brand=x дадуть два
  // різні canonical на ту саму добірку.
  const canonicalParams = new URLSearchParams();
  for (const k of MEANINGFUL) {
    const v = sp[k];
    if (typeof v === "string" && v) canonicalParams.set(k, v);
  }
  const qs = canonicalParams.toString();

  // Індексуємо лише «чисті» посадкові: один бренд / категорія / стать / знижки.
  // Сортування, сторінки, ціна, колір, розмір, пошук — те саме, що вже є під
  // canonical, тож віддаємо follow, але noindex.
  const noise =
    !!sp.sort || !!sp.q || !!sp.min || !!sp.max || !!sp.inStock ||
    parseList(sp.colors).length > 0 || !!sp.color ||
    parseList(sp.sizes).length > 0 || !!sp.size ||
    parseList(sp.seasons).length > 0 ||
    brandSlugs.length > 1 ||
    (parseInt(sp.page ?? "1", 10) || 1) > 1;

  return {
    title,
    description,
    alternates: { canonical: qs ? `/catalog?${qs}` : "/catalog" },
    robots: noise ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description },
  };
}

const SORTS: Record<string, { orderby: "date" | "price"; order: "asc" | "desc"; label: string; short: string }> = {
  newest:     { orderby: "date",  order: "desc", label: "Спочатку нові",    short: "Новинки" },
  price_asc:  { orderby: "price", order: "asc",  label: "Дешевші спочатку", short: "Дешевші" },
  price_desc: { orderby: "price", order: "desc",  label: "Дорожчі спочатку", short: "Дорожчі" },
};

const GENDERS: { slug: string; label: string }[] = [
  { slug: "women", label: "Жінкам" },
  { slug: "men", label: "Чоловікам" },
];

const parseList = (v?: string) =>
  v ? Array.from(new Set(v.split(",").map((s) => s.trim()).filter(Boolean))) : [];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogParams>;
}) {
  const sp = await searchParams;
  // Map legacy WooCommerce nav/URL slugs to the store's own DB slugs so the
  // mega-menu links and old bookmarked URLs don't land on an empty catalog.
  const { category: categorySlug, gender } = resolveCatalogCategory(sp.category, sp.gender);
  const { brandGroup, q, min, max } = sp;

  // Multi-select params: comma-joined lists, with the legacy single param
  // folded in so old bookmarked URLs (?brand=, ?color=, ?size=) still work.
  const brandSlugs = Array.from(new Set([...parseList(sp.brands), ...(sp.brand ? [sp.brand] : [])]));
  const colorNames = Array.from(new Set([...parseList(sp.colors), ...(sp.color ? [sp.color] : [])]));
  const sizeSlugs = Array.from(new Set([...parseList(sp.sizes), ...(sp.size ? [sp.size] : [])]));
  const seasonSlugs = parseList(sp.seasons).filter((s) => s === "summer" || s === "winter");
  const inStock = sp.inStock === "1";
  const onSale = sp.sale === "1";

  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : "newest";
  const { orderby, order } = SORTS[sortKey];
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const perPage = 24;

  // ── Categories + brands facets ────────────────────────────────────────
  const categories = await cachedCategories();

  const brands = (await dbBrands({ categorySlug, gender })).slice(0, 30);
  const brandNames = await cachedBrandNames(brandSlugs);

  // ── Products ─────────────────────────────────────────────────────────
  const { products, total } = await getCatalogProducts({
    categorySlug,
    brandNames,
    brandGroup,
    gender: gender === "women" || gender === "men" ? gender : undefined,
    colors: colorNames,
    seasons: seasonSlugs,
    q,
    sizes: sizeSlugs,
    inStock,
    onSale,
    minPrice: min ? Number(min) : undefined,
    maxPrice: max ? Number(max) : undefined,
    orderby: orderby === "price" ? "price" : "date",
    order,
    page,
    perPage,
  });

  // Забив код — потрапив на товар. Коли запит точно збігається з кодом
  // єдиної знахідки, показувати сітку з однієї плитки й змушувати клікнути в
  // неї — зайвий крок: людина вже назвала конкретний товар. Ганяємо тільки на
  // першій сторінці й без інших фільтрів, щоб не викидати покупця зі
  // звуженого каталогу, і тільки за КОДОМ — збіг за назвою значить, що
  // людина ще обирає.
  const hasNarrowingFilters =
    !!categorySlug || !!gender || !!brandGroup || brandSlugs.length > 0 ||
    colorNames.length > 0 || sizeSlugs.length > 0 || seasonSlugs.length > 0 ||
    inStock || onSale || !!min || !!max;

  // Умова НЕ «знайшлась рівно одна річ»: код на кшталт «18768» через ILIKE
  // ловить ще й чужі коди, де він трапляється підрядком, тож точний товар
  // приїжджає в компанії трьох випадкових. Тому шукаємо серед знайденого
  // товари, чий код ТОЧНО дорівнює запиту: якщо такий рівно один — це він і є.
  if (q && page === 1 && !hasNarrowingFilters && q.trim().length >= 3) {
    const norm = (s: string) => s.replace(/[\s\-_.]/g, "").toLowerCase();
    const needle = norm(q);
    const exact = products.filter((prod) => {
      const sizeCodes = prod.code ? (prod.sizes ?? []).map((s) => `${prod.code}-${s}`) : [];
      const codes = [prod.article, prod.code, prod.id, ...sizeCodes].filter(Boolean) as string[];
      return codes.some((c) => norm(c) === needle);
    });
    if (exact.length === 1) redirect(`/product/${exact[0].slug}`);
  }

  // ── Size + color + price facets ──────────────────────────────────────────
  const sizes = await dbSizeFacets({ categorySlug, q });
  const colors = await dbColorFacets({ categorySlug, gender });
  const seasons = await dbSeasonFacets({ categorySlug, gender });
  const priceRange = await dbPriceRange({ categorySlug, gender });

  // ── Pagination ────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const categoryFacets = categories
    .filter((c) => c.count > 0)
    .slice(0, 20)
    .map((c) => ({ name: c.name, slug: c.slug }));

  const facets: Facets = { brands, categories: categoryFacets, sizes, colors, seasons, priceRange };
  const brandGroupTitle = brandGroup
    ? brandGroup.charAt(0).toUpperCase() + brandGroup.slice(1)
    : undefined;

  const title =
    (brandNames.length === 1 ? brandNames[0] : undefined) ??
    brandGroupTitle ??
    categories.find((c) => c.slug === categorySlug)?.name ??
    GENDERS.find((g) => g.slug === gender)?.label ??
    (onSale ? "Знижки" : undefined) ??
    (q ? `Пошук: ${q}` : "Усі товари");

  const activeFilters = {
    category: categorySlug,
    brands: brandSlugs,
    brandGroup,
    gender,
    colors: colorNames,
    sizes: sizeSlugs,
    seasons: seasonSlugs,
    inStock,
    onSale,
    q,
    sort: sortKey,
    min,
    max,
  };

  function buildHref(overrides: Record<string, string | undefined>) {
    const p: Record<string, string> = {};
    if (categorySlug) p.category = categorySlug;
    if (brandSlugs.length) p.brands = brandSlugs.join(",");
    if (brandGroup) p.brandGroup = brandGroup;
    if (gender) p.gender = gender;
    if (colorNames.length) p.colors = colorNames.join(",");
    if (sizeSlugs.length) p.sizes = sizeSlugs.join(",");
    if (seasonSlugs.length) p.seasons = seasonSlugs.join(",");
    if (inStock) p.inStock = "1";
    if (onSale) p.sale = "1";
    if (q) p.q = q;
    if (min) p.min = min;
    if (max) p.max = max;
    if (sortKey !== "newest") p.sort = sortKey;
    Object.assign(p, overrides);
    // remove undefined keys
    Object.keys(p).forEach((k) => { if (p[k] === undefined) delete p[k]; });
    const qs = new URLSearchParams(p as Record<string, string>).toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }

  // Крихти показують, ДЕ саме опинився покупець. Пошук і «усі товари» окремою
  // сходинкою не є: перше — не місце в каталозі, друге і є сам каталог.
  const landingHref =
    brandSlugs.length === 1 ? `/catalog?brand=${brandSlugs[0]}`
    : categorySlug ? `/catalog?category=${categorySlug}`
    : gender ? `/catalog?gender=${gender}`
    : onSale ? "/catalog?sale=1"
    : undefined;
  const landingName = landingHref && !q ? title : undefined;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE_URL}/catalog` },
      landingName && landingHref
        ? { "@type": "ListItem", position: 3, name: landingName, item: `${SITE_URL}${landingHref}` }
        : null,
    ].filter(Boolean),
  };

  return (
    <section className="wrap py-12 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Reveal>
        <p className="text-[11px] uppercase tracking-luxe text-muted">
          <Link href="/" className="link-underline">Головна</Link>{" / "}
          {landingName ? (
            <>
              <Link href="/catalog" className="link-underline">Каталог</Link>
              {" / "}
              <span className="text-ink/70">{landingName}</span>
            </>
          ) : (
            "Каталог"
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <h1 className="font-display text-3xl text-ink md:text-4xl">{title}</h1>
          <span className="text-[10px] uppercase tracking-luxe text-muted/50">
            {total.toLocaleString("uk-UA")} товарів
          </span>
        </div>
      </Reveal>

      {/* Quick chips — prominent shortcuts (Sale / gender / new) */}
      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {(() => {
          const noFacets = { category: undefined, gender: undefined, sale: undefined, brands: undefined, brandGroup: undefined, page: undefined };
          const chips: { label: string; href: string; active: boolean; sale?: boolean }[] = [
            { label: "Усі товари", href: buildHref(noFacets), active: !onSale && !gender && !categorySlug && !brandSlugs.length },
            { label: "🔥 Sale", href: buildHref({ ...noFacets, sale: "1" }), active: onSale, sale: true },
            { label: "Жінкам", href: buildHref({ ...noFacets, gender: "women" }), active: gender === "women" },
            { label: "Чоловікам", href: buildHref({ ...noFacets, gender: "men" }), active: gender === "men" },
          ];
          return chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-3 text-[11px] uppercase tracking-luxe transition-colors ${
                c.active
                  ? c.sale
                    ? "border-[var(--color-sale)] bg-[var(--color-sale)] text-white"
                    : "border-ink bg-ink text-paper"
                  : c.sale
                    ? "border-[var(--color-sale)]/40 text-[var(--color-sale)] hover:border-[var(--color-sale)]"
                    : "border-line text-ink hover:border-ink"
              }`}
            >
              {c.label}
            </Link>
          ));
        })()}
      </div>

      <div className="mt-6 grid gap-4 md:mt-8 lg:grid-cols-[220px_1fr] lg:gap-12">
        <div className="lg:pt-1">
          <CatalogFilters facets={facets} active={activeFilters} />
        </div>

        <div className="min-w-0">
          {/* Mobile sort dropdown — desktop uses the inline link row below */}
          <div className="mb-4 flex items-center justify-end md:hidden">
            <CatalogSort
              value={sortKey}
              options={Object.entries(SORTS).map(([key, s]) => ({
                key,
                label: s.short,
                href: buildHref({ sort: key === "newest" ? undefined : key, page: undefined }),
              }))}
            />
          </div>

          {/* Brand chips — horizontal scroll (tablet/desktop only; mobile uses Фільтри).
              Click toggles the brand within the multi-select brands list. */}
          {brands.length > 0 && (
            <div className="no-scrollbar mb-5 hidden gap-2 overflow-x-auto pb-1 md:flex">
              {brands.map((b) => {
                const active = brandSlugs.includes(b.slug);
                const next = active ? brandSlugs.filter((s) => s !== b.slug) : [...brandSlugs, b.slug];
                return (
                  <Link
                    key={b.slug}
                    href={buildHref({ brands: next.length ? next.join(",") : undefined, brandGroup: undefined, page: undefined })}
                    className={`shrink-0 rounded-full border px-4 py-2 text-[11px] uppercase tracking-luxe transition-colors ${
                      active ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                    }`}
                  >
                    {b.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Active-filter chips — quick removal of any single applied filter */}
          <ActiveFilterChips
            active={activeFilters}
            brandLabels={Object.fromEntries(brands.map((b) => [b.slug, b.name]))}
            sizeLabels={Object.fromEntries(sizes.map((s) => [s.slug, s.name]))}
            categoryLabel={categories.find((c) => c.slug === categorySlug)?.name}
          />

          {/* Sort bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <p className="text-sm text-muted">
              {products.length
                ? `${((page - 1) * perPage + 1)}–${Math.min(page * perPage, total)} з ${total.toLocaleString("uk-UA")}`
                : "Товарів не знайдено"}
            </p>
            <div className="hidden items-center gap-3 text-[11px] uppercase tracking-luxe md:flex">
              <span className="text-muted">Сортування:</span>
              {Object.entries(SORTS).map(([key, s]) => (
                <Link
                  key={key}
                  href={buildHref({ sort: key === "newest" ? undefined : key, page: undefined })}
                  className={`link-underline ${sortKey === key ? "text-ink" : "text-muted hover:text-ink"}`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Grid */}
          {products.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-3 xl:grid-cols-4">
              {products.map((product, i) => (
                <Reveal key={product.id} delay={(i % 4) * 70}>
                  <ProductCard product={product} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="surface-card mt-8 rounded-[4px] px-6 py-16 text-center">
              <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cloud text-lg">⌕</p>
              <h2 className="mt-4 font-display text-2xl text-ink">Нічого не знайшли</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                Спробуйте прибрати частину фільтрів або перейти до всього каталогу — інколи один зайвий розмір ховає гарні речі.
              </p>
              <Link href="/catalog" className="mt-6 inline-flex h-11 items-center rounded-full border border-ink px-6 text-[11px] uppercase tracking-luxe text-ink transition-colors hover:bg-ink hover:text-paper">
                Скинути фільтри
              </Link>
            </div>
          )}

          {/* Pagination */}
          {totalPages && totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-1.5">
              <Link
                href={buildHref({ page: String(page - 1) })}
                aria-disabled={page <= 1}
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm transition-colors ${
                  page <= 1
                    ? "pointer-events-none border-line text-muted/30"
                    : "border-line text-ink hover:border-ink"
                }`}
              >
                ‹
              </Link>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="flex h-11 w-11 items-center justify-center text-sm text-muted">…</span>
                  ) : (
                    <Link
                      key={p}
                      href={buildHref({ page: p === 1 ? undefined : String(p) })}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm transition-colors ${
                        p === page
                          ? "border-ink bg-ink text-paper"
                          : "border-line text-ink hover:border-ink"
                      }`}
                    >
                      {p}
                    </Link>
                  )
                )}

              <Link
                href={buildHref({ page: String(page + 1) })}
                aria-disabled={page >= totalPages}
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm transition-colors ${
                  page >= totalPages
                    ? "pointer-events-none border-line text-muted/30"
                    : "border-line text-ink hover:border-ink"
                }`}
              >
                ›
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
