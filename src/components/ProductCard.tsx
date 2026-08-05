import Link from "next/link";
import { ProductCardMedia } from "./ProductCardMedia";
import { WishButton } from "./WishButton";
import {
  discountPercent,
  formatPrice,
  TAG_LABELS,
  type Product,
} from "@/lib/catalog";

export function ProductCard({ product }: { product: Product }) {
  const { brand, name, price, oldPrice, tag, tone, slug, image, images, sizes } = product;
  const discount = discountPercent(product);
  const archived = product.inStock === false;

  return (
    // `group` тримає обгортка, а не саме посилання: кнопка «в обране» мусить
    // бути ПОЗА <a>. Кнопка всередині посилання — невалідна розмітка: клавіатура
    // й читалки бачать два вкладені інтерактивні елементи, а клік по серцю не
    // відкривав картку лише завдяки preventDefault. Наведення при цьому має
    // підсвічувати картку цілком, тож group спільна для посилання й кнопки.
    <div className="group relative rounded-[2px]">
    <Link href={`/product/${slug}`} className="block rounded-[2px] focus-visible:outline-offset-4">
      <div className="surface-card surface-card-hover relative overflow-hidden rounded-[2px]">
        <div className={archived ? "opacity-60 grayscale-[35%]" : ""}>
          <ProductCardMedia tone={tone} brand={brand} image={image} images={images} />
        </div>

        {archived ? (
          <span className="absolute left-3 top-3 z-20 bg-ink/70 px-2.5 py-1 text-[10px] uppercase tracking-luxe text-paper backdrop-blur-sm">
            Немає в наявності
          </span>
        ) : discount ? (
          <span className="absolute left-3 top-3 z-20 bg-[#b3392c] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-luxe text-paper">
            -{discount}%
          </span>
        ) : tag ? (
          <span className="absolute left-3 top-3 z-20 bg-paper/90 px-2.5 py-1 text-[10px] uppercase tracking-luxe text-ink backdrop-blur-sm">
            {TAG_LABELS[tag]}
          </span>
        ) : null}

        {!archived && (
          <div className="absolute inset-x-0 bottom-0 z-20 hidden translate-y-full bg-ink/95 py-3 text-center text-[10px] uppercase tracking-luxe text-paper backdrop-blur-sm transition-transform duration-300 ease-out group-hover:translate-y-0 md:block">
            Переглянути товар
          </div>
        )}
      </div>

      <div className="mt-3 px-0.5">
        <p className="truncate text-[10px] uppercase tracking-luxe text-muted">{brand || "MANIA GROUP"}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.45em] text-[13px] leading-snug text-ink md:text-sm">{name}</h3>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className={`text-sm tabular-nums ${discount ? "font-medium text-[#b3392c]" : "text-ink"}`}>
            {formatPrice(price)}
          </span>
          {oldPrice && (
            <span className="text-xs tabular-nums text-muted line-through">
              {formatPrice(oldPrice)}
            </span>
          )}
        </div>

        {/* Розміри видно завжди, без наведення: покупець одразу бачить, чи є
            його розмір, і не заходить у картку дарма. Довгі ряди обрізаємо —
            повний перелік усе одно на сторінці товару. */}
        {!archived && sizes && sizes.length > 0 && (
          <p className="mt-1.5 truncate text-[11px] uppercase tracking-[0.08em] text-muted">
            {sizes.slice(0, 8).join(" · ")}
            {sizes.length > 8 && " …"}
          </p>
        )}
      </div>
    </Link>

      {!archived && (
        <WishButton
          productId={product.id}
          className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-paper/92 text-ink shadow-[0_8px_20px_-14px_rgba(26,23,20,0.65)] backdrop-blur-sm transition-all duration-200 hover:scale-105 md:opacity-0 md:group-hover:opacity-100 [.wished_&]:opacity-100"
        />
      )}
    </div>
  );
}
