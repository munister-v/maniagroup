import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { Grain } from "@/components/Grain";
import { fromWcProduct, formatPrice } from "@/lib/catalog";
import { fetchCategories, fetchProductById, fetchProducts } from "@/lib/wc";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ProductCard } from "@/components/ProductCard";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // `slug` is the numeric product id (the Store API has no usable slug here).
  const wcProduct = await fetchProductById(slug);
  if (!wcProduct) notFound();

  const product = fromWcProduct(wcProduct);
  const images = wcProduct.images.length ? wcProduct.images : null;
  const sizes = wcProduct.attributes.find((a) => a.taxonomy === "pa_size")?.terms ?? [];

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
          <div className="grid gap-3">
            {images ? (
              images.slice(0, 4).map((img) => (
                <div key={img.id} className="relative aspect-[3/4] overflow-hidden bg-cloud">
                  <Image
                    src={img.src}
                    alt={product.name}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ))
            ) : (
              <div className="relative aspect-[3/4] overflow-hidden bg-cloud">
                <Grain variant="strong" />
              </div>
            )}
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="md:sticky md:top-28">
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
