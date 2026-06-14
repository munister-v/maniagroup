import Link from "next/link";
import { ProductMedia } from "./ProductMedia";
import {
  formatPrice,
  productSwatches,
  TAG_LABELS,
  type Product,
} from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  const { brand, name, price, oldPrice, tag, tone, slug, category } = product;
  const swatches = productSwatches(product);

  return (
    <Link href={`#${slug}`} className="group block">
      <div className="relative overflow-hidden">
        <ProductMedia tone={tone} brand={brand} category={category} />

        {tag && (
          <span className="absolute left-3 top-3 z-20 bg-paper/90 px-2.5 py-1 text-[10px] uppercase tracking-luxe text-ink backdrop-blur-sm">
            {TAG_LABELS[tag]}
          </span>
        )}

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
          <span className="text-sm tabular-nums text-ink">{formatPrice(price)}</span>
          {oldPrice && (
            <span className="text-xs tabular-nums text-muted line-through">
              {formatPrice(oldPrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
