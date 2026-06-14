import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { CatalogFilters, type Facets } from "@/components/CatalogFilters";
import { getCatalogProducts, getCatalogCategories, dbSizeFacets, dbBrands } from "@/lib/productSource";
import { resolveCatalogCategory } from "@/lib/categoryAliases";

export const metadata = {
  title: "Каталог — Mania Group",
};

const SORTS: Record<string, { orderby: "date" | "price"; order: "asc" | "desc"; label: string }> = {
  newest:     { orderby: "date",  order: "desc", label: "Спочатку нові" },
  price_asc:  { orderby: "price", order: "asc",  label: "Дешевші спочатку" },
  price_desc: { orderby: "price", order: "desc",  label: "Дорожчі спочатку" },
};

const GENDERS: { slug: string; label: string }[] = [
  { slug: "women", label: "Жінкам" },
  { slug: "men", label: "Чоловікам" },
];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    brand?: string;
    gender?: string;
    q?: string;
    sort?: string;
    size?: string;
    min?: string;
    max?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  // Map legacy WooCommerce nav/URL slugs to the store's own DB slugs so the
  // mega-menu links and old bookmarked URLs don't land on an empty catalog.
  const { category: categorySlug, gender } = resolveCatalogCategory(sp.category, sp.gender);
  const { brand: brandSlugParam, q, size, min, max } = sp;
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : "newest";
  const { orderby, order } = SORTS[sortKey];
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const perPage = 24;

  // ── Categories + brands facets ────────────────────────────────────────
  const categories = await getCatalogCategories();

  const brands = (await dbBrands({ categorySlug, gender })).slice(0, 24);
  const brandName = brandSlugParam ? brands.find((b) => b.slug === brandSlugParam)?.name : undefined;

  // ── Products ─────────────────────────────────────────────────────────
  const { products, total } = await getCatalogProducts({
    categorySlug,
    brandName,
    gender: gender === "women" || gender === "men" ? gender : undefined,
    q,
    size,
    minPrice: min ? Number(min) : undefined,
    maxPrice: max ? Number(max) : undefined,
    orderby: orderby === "price" ? "price" : "date",
    order,
    page,
    perPage,
  });

  // ── Size facets ───────────────────────────────────────────────────────
  const sizes = await dbSizeFacets({ categorySlug, q });

  // ── Pagination ────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const categoryFacets = categories
    .filter((c) => c.count > 0)
    .slice(0, 20)
    .map((c) => ({ name: c.name, slug: c.slug }));

  const facets: Facets = { brands, categories: categoryFacets, sizes };
  const title =
    brandName ??
    categories.find((c) => c.slug === categorySlug)?.name ??
    GENDERS.find((g) => g.slug === gender)?.label ??
    (q ? `Пошук: ${q}` : "Усі товари");

  function buildHref(overrides: Record<string, string | undefined>) {
    const p: Record<string, string> = {};
    if (categorySlug) p.category = categorySlug;
    if (brandSlugParam) p.brand = brandSlugParam;
    if (gender) p.gender = gender;
    if (q) p.q = q;
    if (size) p.size = size;
    if (min) p.min = min;
    if (max) p.max = max;
    if (sortKey !== "newest") p.sort = sortKey;
    Object.assign(p, overrides);
    // remove undefined keys
    Object.keys(p).forEach((k) => { if (p[k] === undefined) delete p[k]; });
    const qs = new URLSearchParams(p as Record<string, string>).toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }

  return (
    <section className="wrap py-12 md:py-16">
      <Reveal>
        <p className="text-[11px] uppercase tracking-luxe text-muted">
          <Link href="/" className="link-underline">Головна</Link> / Каталог
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <h1 className="font-display text-3xl text-ink md:text-4xl">{title}</h1>
          <span className="text-[10px] uppercase tracking-luxe text-muted/50">
            {total.toLocaleString("uk-UA")} товарів
          </span>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
        <div className="lg:pt-1">
          <CatalogFilters
            facets={facets}
            active={{ category: categorySlug, brand: brandSlugParam, gender, q, sort: sortKey, size, min, max }}
          />
        </div>

        <div className="min-w-0">
          {/* Gender toggle */}
          <div className="mb-4 flex gap-2">
            {GENDERS.map((g) => {
              const active = gender === g.slug;
              return (
                <Link
                  key={g.slug}
                  href={buildHref({ gender: active ? undefined : g.slug, page: undefined })}
                  className={`border px-5 py-2 text-[11px] uppercase tracking-luxe transition-colors ${
                    active ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                  }`}
                >
                  {g.label}
                </Link>
              );
            })}
          </div>

          {/* Brand chips — horizontal scroll */}
          {brands.length > 0 && (
            <div className="mb-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {brands.map((b) => {
                const active = brandSlugParam === b.slug;
                return (
                  <Link
                    key={b.slug}
                    href={buildHref(active ? { brand: undefined } : { brand: b.slug, page: undefined })}
                    className={`shrink-0 border px-4 py-2 text-[11px] uppercase tracking-luxe transition-colors ${
                      active ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                    }`}
                  >
                    {b.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Sort bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <p className="text-sm text-muted">
              {products.length
                ? `${((page - 1) * perPage + 1)}–${Math.min(page * perPage, total)} з ${total.toLocaleString("uk-UA")}`
                : "Товарів не знайдено"}
            </p>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-luxe">
              <span className="hidden text-muted sm:inline">Сортування:</span>
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
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.map((product, i) => (
              <Reveal key={product.id} delay={(i % 4) * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>

          {/* Pagination */}
          {totalPages && totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-1.5">
              <Link
                href={buildHref({ page: String(page - 1) })}
                aria-disabled={page <= 1}
                className={`flex h-9 w-9 items-center justify-center border text-sm transition-colors ${
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
                    <span key={`ellipsis-${i}`} className="flex h-9 w-9 items-center justify-center text-sm text-muted">…</span>
                  ) : (
                    <Link
                      key={p}
                      href={buildHref({ page: p === 1 ? undefined : String(p) })}
                      className={`flex h-9 w-9 items-center justify-center border text-sm transition-colors ${
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
                className={`flex h-9 w-9 items-center justify-center border text-sm transition-colors ${
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
