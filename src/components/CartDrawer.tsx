"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/catalog";
import type { Cart } from "@/lib/cart";

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cart");
    const data = (await res.json()) as Cart;
    setCart(data);
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: data.items_count } }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    window.addEventListener("cart:updated-external", refresh);
    return () => window.removeEventListener("cart:updated-external", refresh);
  }, [refresh]);

  // close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function changeQty(key: string, quantity: number) {
    setPending(key);
    const res = await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, quantity }),
    });
    const data = (await res.json()) as Cart;
    setCart(data);
    setPending(null);
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: data.items_count } }));
  }

  const items = cart?.items ?? [];
  const subtotal = cart?.subtotal ?? 0;

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
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-paper shadow-[0_28px_80px_-34px_rgba(26,23,20,0.75)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Кошик"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-[12px] uppercase tracking-luxe text-ink">
            Кошик ({cart?.items_count ?? 0})
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-cloud"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6">
          {items.length === 0 && (
            <div className="flex min-h-[42vh] flex-col items-center justify-center py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cloud text-ink">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <p className="mt-4 font-display text-2xl text-ink">Кошик порожній</p>
              <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-muted">Додайте річ у каталозі, і вона з’явиться тут миттєво.</p>
              <Link href="/catalog" onClick={onClose} className="mt-6 inline-flex h-11 items-center rounded-full border border-ink px-6 text-[11px] uppercase tracking-luxe text-ink transition-colors hover:bg-ink hover:text-paper">
                До каталогу
              </Link>
            </div>
          )}
          {items.map((it) => (
            <div key={it.key} className="flex gap-4 border-b border-line py-5">
              <div className="surface-card relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-[2px] bg-cloud">
                {it.image && (
                  <Image src={it.image} alt={it.name} fill sizes="80px" className="object-cover" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-luxe text-muted">{it.brand}</p>
                <h3 className="text-sm text-ink">{it.name}</h3>
                {it.variation && (
                  <p className="mt-1 text-xs text-muted">Розмір: {it.variation}</p>
                )}
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center rounded-full border border-line bg-white text-ink">
                    <button
                      onClick={() => changeQty(it.key, it.quantity - 1)}
                      disabled={pending === it.key}
                      className="flex h-9 w-9 items-center justify-center rounded-l-full text-sm hover:bg-cloud disabled:opacity-40"
                      aria-label="Менше"
                    >
                      −
                    </button>
                    <span className="min-w-7 px-1 text-center text-xs tabular-nums">{it.quantity}</span>
                    <button
                      onClick={() => changeQty(it.key, it.quantity + 1)}
                      disabled={pending === it.key}
                      className="flex h-9 w-9 items-center justify-center rounded-r-full text-sm hover:bg-cloud disabled:opacity-40"
                      aria-label="Більше"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm tabular-nums text-ink">
                    {formatPrice(it.line_total)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="border-t border-line bg-paper/96 px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-6 sm:py-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] uppercase tracking-luxe text-muted">Разом</span>
            <span className="font-display text-2xl text-ink">{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Доставка розраховується на оформленні
          </p>
          <Link
            href="/checkout"
            onClick={onClose}
            className={`mt-4 flex h-12 w-full items-center justify-center rounded-[2px] bg-ink text-[12px] uppercase tracking-luxe text-paper transition-all hover:-translate-y-px hover:opacity-90 ${
              items.length === 0 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Оформити замовлення
          </Link>
          <button
            onClick={onClose}
            className="mt-2 h-11 w-full rounded-[2px] text-[12px] uppercase tracking-luxe text-ink transition-colors hover:bg-cloud/60"
          >
            <span className="link-underline">Продовжити покупки</span>
          </button>
        </footer>
      </aside>
    </div>
  );
}
