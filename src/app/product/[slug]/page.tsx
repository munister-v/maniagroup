import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { formatPrice } from "@/lib/catalog";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductCard } from "@/components/ProductCard";
import { ProductMedia } from "@/components/ProductMedia";
import { ProductGallery } from "@/components/ProductGallery";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { dbProductById, getCatalogProducts, type DbProductDetail } from "@/lib/productSource";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await dbProductById(slug);
  if (!detail) return {};
  const t = `${detail.product.name} — ${detail.product.brand} | Mania Group`;
  const description = `${detail.product.name} від ${detail.product.brand}. Оригінал, доставка Новою Поштою по всій Україні.`;
  return {
    title: t,
    description,
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      title: t,
      description,
      images: detail.product.image ? [detail.product.image] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await dbProductById(slug);
  if (!detail) notFound();

  let related: DbProductDetail["product"][] = [];
  if (detail.product.categorySlug) {
    const res = await getCatalogProducts({ categorySlug: detail.product.categorySlug, perPage: 5 });
    related = res.products.filter((p) => p.id !== detail.product.id).slice(0, 4);
  }

  return <ProductView detail={detail} related={related} />;
}

function ProductView({
  detail,
  related,
}: {
  detail: DbProductDetail;
  related: DbProductDetail["product"][];
}) {
  const { product, images, sizes, composition, color, season, country, inStock } = detail;
  const gallery = images.map((img, i) => ({
    id: i,
    src: img.src,
    thumbnail: img.src,
    alt: `${product.name} — ${product.brand}`,
  }));
  const specs: { label: string; value: string }[] = [
    { label: "Бренд", value: product.brand },
    { label: "Колір", value: color ?? "" },
    { label: "Сезон", value: season ?? "" },
    { label: "Склад", value: composition ?? "" },
    { label: "Країна", value: country ?? "" },
  ].filter((s) => s.value);

  const BASE = "https://maniagroup.munister.com.ua";
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: `${product.name} від ${product.brand}. Оригінал.`,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category,
    image: gallery.length > 0 ? gallery.map((g) => g.src) : product.image ? [product.image] : undefined,
    sku: product.id,
    color: color || undefined,
    offers: {
      "@type": "Offer",
      url: `${BASE}/product/${product.id}`,
      priceCurrency: "UAH",
      price: product.price,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Головна", item: BASE },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${BASE}/catalog` },
      product.categorySlug && {
        "@type": "ListItem",
        position: 3,
        name: product.category,
        item: `${BASE}/catalog?category=${product.categorySlug}`,
      },
      { "@type": "ListItem", position: product.categorySlug ? 4 : 3, name: product.name, item: `${BASE}/product/${product.id}` },
    ].filter(Boolean),
  };

  return (
    <section className="wrap py-12 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">Головна</Link>{" "}
        / <Link href="/catalog" className="link-underline">Каталог</Link> /{" "}
        <Link href={`/catalog?category=${product.categorySlug ?? ""}`} className="link-underline">
          {product.category}
        </Link>
      </p>

      <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          {gallery.length > 0 ? (
            <ProductGallery images={gallery} name={product.name} />
          ) : (
            <div className="group">
              <ProductMedia tone={product.tone} brand={product.brand} category={product.category} image={product.image} />
            </div>
          )}
        </Reveal>

        <Reveal delay={100}>
          <div className="md:sticky md:top-36">
            <p className="text-[11px] uppercase tracking-luxe text-muted">{product.brand}</p>
            <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">{product.name}</h1>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-xl tabular-nums text-ink">{formatPrice(product.price)}</span>
              {product.oldPrice && (
                <span className="text-base tabular-nums text-muted line-through">
                  {formatPrice(product.oldPrice)}
                </span>
              )}
            </div>

            {inStock ? (
              <AddToCartButton inStock={inStock} productId={product.id} sizes={sizes} />
            ) : (
              <div className="mt-6 border border-line bg-cloud/50 px-4 py-3 text-sm text-muted">
                Цей товар наразі <span className="text-ink">немає в наявності</span>. Зателефонуйте
                нам — можливо, його ще можна замовити або підкажемо схожий.
              </div>
            )}

            {specs.length > 0 && (
              <dl className="mt-8 space-y-2 border-t border-line pt-6 text-sm">
                {specs.map((s) => (
                  <div key={s.label} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-muted">{s.label}</dt>
                    <dd className="text-ink">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Reveal>
      </div>

      {related.length > 0 && (
        <Reveal>
          <div className="mt-20 border-t border-line pt-12 md:mt-28">
            <h2 className="font-display text-2xl text-ink md:text-3xl">Схожі товари</h2>
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </Reveal>
      )}

      <RecentlyViewed currentId={product.id} />
    </section>
  );
}
