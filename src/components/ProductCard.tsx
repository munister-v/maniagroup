import Link from "next/link";
import { ProductMedia } from "./ProductMedia";
import {
  discountPercent,
  formatPrice,
  productSwatches,
  TAG_LABELS,
  type Product,
} from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  const { brand, name, price, oldPrice, tag, tone, slug, category, image } = product;
  const swatches = productSwatches(product);
  const discount = discountPercent(product);

  return (
    <Link href={`/product/${slug}`} className="group block">
      <div className="relative overflow-hidden">
        <ProductMedia tone={tone} brand={brand} category={category} image={image} />

        {discount ? (
          <span className="absolute left-3 top-3 z-20 bg-[#b3392c] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-luxe text-paper">
            -{discount}%
          </span>
        ) : (
          tag && (
            <span className="absolute left-3 top-3 z-20 bg-paper/90 px-2.5 py-1 text-[10px] uppercase tracking-luxe text-ink backdrop-blur-sm">
              {TAG_LABELS[tag]}
            </span>
          )
        )}

        {/* wishlist heart — appears on hover */}
        <span
          role="button"
          aria-label="До обраного"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center bg-paper/90 text-ink opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {/* quick-view bar — slides up on hover */}
        <div className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-ink py-3 text-center text-[11px] uppercase tracking-luxe text-paper transition-transform duration-300 ease-out group-hover:translate-y-0">
          Швидкий перегляд
        </div>
      </div>

      <div className="mt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">{brand}</p>
            <h3 className="mt-1 text-sm text-ink">{name}</h3>
          </div>
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
            {swatches.map((c, i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/10"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className={`text-base font-medium tabular-nums ${discount ? "text-[#b3392c]" : "text-ink"}`}>
            {formatPrice(price)}
          </span>
          {oldPrice && (
            <span className="text-sm tabular-nums text-muted line-through">
              {formatPrice(oldPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
