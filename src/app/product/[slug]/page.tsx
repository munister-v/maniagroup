import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { fromWcProduct, formatPrice } from "@/lib/catalog";
import { fetchCategories, fetchProductById, fetchProducts } from "@/lib/wc";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductCard } from "@/components/ProductCard";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductMedia } from "@/components/ProductMedia";
import { dbProductById, type DbProductDetail } from "@/lib/productSource";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wcProduct = await fetchProductById(slug).catch(() => null);
  if (!wcProduct) {
    const detail = dbProductById(slug);
    if (!detail) return {};
    const t = `${detail.product.name} — ${detail.product.brand} | Mania Group`;
    return { title: t, description: `${detail.product.name} від ${detail.product.brand}. Mania Group.` };
  }

  const product = fromWcProduct(wcProduct);
  const title = `${product.name} — ${product.brand} | Mania Group`;
  const description =
    wcProduct.short_description?.replace(/<[^>]+>/g, "").trim().slice(0, 160) ||
    `${product.name} від ${product.brand}. Оригінал, доставка Новою Поштою по всій Україні.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: Array.isArray(wcProduct.images) && wcProduct.images[0]?.src ? [wcProduct.images[0].src] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // `slug` is the numeric product id (the Store API has no usable slug here).
  const wcProduct = await fetchProductById(slug);
  if (!wcProduct) {
    // Archived / no-Store-API products live only in catalog.db.
    const detail = dbProductById(slug);
    if (!detail) notFound();
    return <DbProductView detail={detail} />;
  }

  // The Store API occasionally returns `images`/`attributes` as non-arrays.
  const wcImages = Array.isArray(wcProduct.images) ? wcProduct.images : [];
  const wcAttributes = Array.isArray(wcProduct.attributes) ? wcProduct.attributes : [];
  const product = fromWcProduct({ ...wcProduct, images: wcImages, attributes: wcAttributes });
  const sizes = wcAttributes.find((a) => a.taxonomy === "pa_size")?.terms ?? [];

  let related: ReturnType<typeof fromWcProduct>[] = [];
  if (product.categorySlug) {
    const categories = await fetchCategories().catch(() => []);
    const cat = categories.find((c) => c.slug === product.categorySlug);
    if (cat) {
      const wcRelated = await fetchProducts({ perPage: 5, category: cat.id }).catch(() => []);
      related = wcRelated.filter((p) => p.id !== wcProduct.id).slice(0, 4).map(fromWcProduct);
    }
  }

  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        /{" "}
        <Link href={`/catalog?category=${product.categorySlug ?? ""}`} className="link-underline">
          {product.category}
        </Link>
      </p>

      <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          <ProductGallery images={wcImages} name={product.name} />
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

            <AddToCartButton
              inStock={wcProduct.is_in_stock}
              productId={wcProduct.id}
              sizes={sizes}
              variations={wcProduct.variations}
            />

            {wcProduct.short_description && (
              <div
                className="prose-sm mt-8 max-w-none border-t border-line pt-6 text-sm leading-relaxed text-muted [&_p]:m-0"
                dangerouslySetInnerHTML={{ __html: wcProduct.short_description }}
              />
            )}

            {wcProduct.description && (
              <div
                className="mt-4 max-w-none text-sm leading-relaxed text-muted [&_p]:m-0"
                dangerouslySetInnerHTML={{ __html: wcProduct.description }}
              />
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
    </section>
  );
}

/**
 * Detail view for products that exist only in catalog.db — archived items
 * ("Немає в наявності") and in-stock items the Store API didn't return.
 * No live variations, so no add-to-cart.
 */
function DbProductView({ detail }: { detail: DbProductDetail }) {
  const { product, sizes, composition, color, season, country, inStock } = detail;
  const specs: { label: string; value: string }[] = [
    { label: "Бренд", value: product.brand },
    { label: "Колір", value: color ?? "" },
    { label: "Сезон", value: season ?? "" },
    { label: "Склад", value: composition ?? "" },
    { label: "Країна", value: country ?? "" },
  ].filter((s) => s.value);

  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">Головна</Link>{" "}
        / <Link href="/catalog" className="link-underline">Каталог</Link> / {product.category}
      </p>

      <div className="mt-6 grid gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          <div className="group">
            <ProductMedia tone={product.tone} brand={product.brand} category={product.category} image={product.image} />
          </div>
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

            {!inStock && (
              <div className="mt-6 border border-line bg-cloud/50 px-4 py-3 text-sm text-muted">
                Цей товар наразі <span className="text-ink">немає в наявності</span>. Зателефонуйте
                нам — можливо, його ще можна замовити або підкажемо схожий.
              </div>
            )}

            {sizes.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-luxe text-muted">Розміри</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <span key={s} className="flex h-9 min-w-9 items-center justify-center border border-line px-2.5 text-xs uppercase text-ink">
                      {s}
                    </span>
                  ))}
                </div>
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

            <Link
              href="/catalog"
              className="mt-8 inline-flex h-12 items-center border border-ink px-8 text-[12px] uppercase tracking-luxe text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              До каталогу
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
