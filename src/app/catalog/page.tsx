import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";
import { CatalogFilters, type Facets } from "@/components/CatalogFilters";
import { fromWcProduct } from "@/lib/catalog";
import { fetchCategories, fetchProducts } from "@/lib/wc";

export const metadata = {
  title: "Каталог — Mania Group",
};

const SORTS: Record<string, { orderby: "date" | "price"; order: "asc" | "desc"; label: string }> = {
  newest: { orderby: "date", order: "desc", label: "Спочатку нові" },
  price_asc: { orderby: "price", order: "asc", label: "Дешевші спочатку" },
  price_desc: { orderby: "price", order: "desc", label: "Дорожчі спочатку" },
};

const BRAND_NAME = /^[A-Z0-9][A-Z0-9 .&'-]+$/;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    q?: string;
    sort?: string;
    size?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const sp = await searchParams;
  const { category: categorySlug, q, size, min, max } = sp;
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : "newest";
  const { orderby, order } = SORTS[sortKey];

  const categories = await fetchCategories().catch(() => []);
  const category = categorySlug
    ? categories.find((c) => c.slug === categorySlug)
    : undefined;

  // brand facets: uppercase-named categories with products, by popularity
  const brands = categories
    .filter((c) => c.count > 0 && BRAND_NAME.test(c.name) && c.name.length <= 24)
    .sort((a, b) => b.count - a.count)
    .slice(0, 14)
    .map((c) => ({ name: c.name, slug: c.slug }));

  // displayed products (all filters applied)
  const wcProducts = await fetchProducts({
    perPage: 24,
    category: category?.id,
    search: q,
    orderby,
    order,
    sizeSlug: size,
    minPrice: min ? Number(min) : undefined,
    maxPrice: max ? Number(max) : undefined,
  }).catch(() => []);

  // size facets: distinct pa_size terms appearing in this scope (unfiltered by size)
  const facetSource = await fetchProducts({
    perPage: 50,
    category: category?.id,
    search: q,
  }).catch(() => []);
  const sizeMap = new Map<string, string>();
  for (const p of facetSource) {
    const terms = p.attributes.find((a) => a.taxonomy === "pa_size")?.terms ?? [];
    for (const t of terms) sizeMap.set(t.slug, t.name);
  }
  const sizes = Array.from(sizeMap, ([slug, name]) => ({ slug, name })).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  const facets: Facets = { brands, sizes };
  const products = wcProducts.map(fromWcProduct);
  const title = category?.name ?? (q ? `Пошук: ${q}` : "Усі товари");

  const sortHref = (key: string) => {
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    if (q) params.set("q", q);
    if (size) params.set("size", size);
    if (min) params.set("min", min);
    if (max) params.set("max", max);
    if (key !== "newest") params.set("sort", key);
    const qs = params.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  };

  return (
    <section className="wrap py-12 md:py-16">
      <Reveal>
        <p className="text-[11px] uppercase tracking-luxe text-muted">
          <Link href="/" className="link-underline">
            Головна
          </Link>{" "}
          / Каталог
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">{title}</h1>
      </Reveal>

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
        <div className="lg:pt-1">
          <CatalogFilters
            facets={facets}
            active={{ category: categorySlug, q, sort: sortKey, size, min, max }}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
            <p className="text-sm text-muted">
              {products.length
                ? `Знайдено ${products.length} товарів`
                : "Товарів не знайдено"}
            </p>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-luxe">
              <span className="hidden text-muted sm:inline">Сортування:</span>
              {Object.entries(SORTS).map(([key, s]) => (
                <Link
                  key={key}
                  href={sortHref(key)}
                  className={`link-underline ${
                    sortKey === key ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
            {products.map((product, i) => (
              <Reveal key={product.id} delay={(i % 4) * 70}>
                <ProductCard product={product} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
