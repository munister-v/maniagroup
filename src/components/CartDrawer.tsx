"use client";

import { useEffect } from "react";
import { ProductMedia } from "./ProductMedia";
import { formatPrice, SAMPLE_CART } from "@/lib/catalog";

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const items = SAMPLE_CART;
  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);

  // close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[60] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Кошик"
      >
        <header className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="text-[12px] uppercase tracking-luxe text-ink">
            Кошик ({items.length})
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="text-ink hover:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6">
          {items.map((it, idx) => (
            <div key={idx} className="flex gap-4 border-b border-line py-5">
              <div className="w-20 shrink-0">
                <ProductMedia
                  tone={it.product.tone}
                  brand={it.product.brand}
                  className="aspect-[3/4]"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-luxe text-muted">
                  {it.product.brand}
                </p>
                <h3 className="mt-0.5 text-sm text-ink">{it.product.name}</h3>
                <p className="mt-1 text-xs text-muted">Розмір: {it.size}</p>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center border border-line text-ink">
                    <button className="px-2.5 py-1 text-sm hover:bg-cloud" aria-label="Менше">−</button>
                    <span className="px-2 text-xs tabular-nums">{it.qty}</span>
                    <button className="px-2.5 py-1 text-sm hover:bg-cloud" aria-label="Більше">+</button>
                  </div>
                  <span className="text-sm tabular-nums text-ink">
                    {formatPrice(it.product.price * it.qty)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="border-t border-line px-6 py-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] uppercase tracking-luxe text-muted">Разом</span>
            <span className="font-display text-2xl text-ink">{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Доставка розраховується на оформленні
          </p>
          <button className="mt-4 h-12 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85">
            Оформити замовлення
          </button>
          <button
            onClick={onClose}
            className="mt-2 h-11 w-full text-[12px] uppercase tracking-luxe text-ink"
          >
            <span className="link-underline">Продовжити покупки</span>
          </button>
        </footer>
      </aside>
    </div>
  );
}
