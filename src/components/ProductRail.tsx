"use client";

import { useRef } from "react";
import Link from "next/link";
import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/catalog";

/**
 * Answear-style horizontal product carousel: scroll-snap row with prev/next
 * arrow buttons on desktop, native swipe on touch. Section header on the left,
 * "дивитись всі" link on the right.
 */
export function ProductRail({
  title, eyebrow, href, products, label = "Дивитись всі",
}: {
  title: string;
  eyebrow?: string;
  href: string;
  products: Product[];
  label?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  if (!products.length) return null;

  function scroll(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  return (
    <section className="py-9 md:py-12">
      <div className="wrap">
        {/* Header */}
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c1352a]">{eyebrow}</p>}
            <h2 className="mt-1 text-[1.6rem] font-extrabold uppercase leading-none tracking-tight text-ink md:text-[2.1rem]">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Link href={href} className="hidden text-[12px] font-semibold uppercase tracking-[0.12em] text-ink underline-offset-4 hover:underline sm:block">
              {label}
            </Link>
            <div className="hidden items-center gap-1.5 md:flex">
              <button onClick={() => scroll(-1)} aria-label="Назад"
                className="flex h-10 w-10 items-center justify-center border border-line bg-white text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button onClick={() => scroll(1)} aria-label="Далі"
                className="flex h-10 w-10 items-center justify-center border border-line bg-white text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Rail */}
        <div ref={scroller}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-4">
          {products.map((p) => (
            <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23.5%] lg:w-[19%]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>

        <div className="mt-4 text-center sm:hidden">
          <Link href={href} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink underline-offset-4">
            {label} →
          </Link>
        </div>
      </div>
    </section>
  );
}
