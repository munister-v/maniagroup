"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/catalog";
import { cartItemPriceUah, type WcCart } from "@/lib/wcCart";

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [cart, setCart] = useState<WcCart | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cart");
    const data = (await res.json()) as WcCart;
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
    const data = (await res.json()) as WcCart;
    setCart(data);
    setPending(null);
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: data.items_count } }));
  }

  const items = cart?.items ?? [];
  const subtotal = cart ? Math.round(Number(cart.totals.total_price) / 10 ** cart.totals.currency_minor_unit) : 0;

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
            Кошик ({cart?.items_count ?? 0})
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
          {items.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">Кошик порожній</p>
          )}
          {items.map((it) => (
            <div key={it.key} className="flex gap-4 border-b border-line py-5">
              <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-cloud">
                {it.images[0]?.src && (
                  <Image src={it.images[0].src} alt={it.name} fill sizes="80px" className="object-cover" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-sm text-ink">{it.name}</h3>
                {it.variation.map((v) => (
                  <p key={v.attribute} className="mt-1 text-xs text-muted">
                    {v.attribute}: {v.value}
                  </p>
                ))}
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-center border border-line text-ink">
                    <button
                      onClick={() => changeQty(it.key, it.quantity - 1)}
                      disabled={pending === it.key}
                      className="px-2.5 py-1 text-sm hover:bg-cloud disabled:opacity-40"
                      aria-label="Менше"
                    >
                      −
                    </button>
                    <span className="px-2 text-xs tabular-nums">{it.quantity}</span>
                    <button
                      onClick={() => changeQty(it.key, it.quantity + 1)}
                      disabled={pending === it.key}
                      className="px-2.5 py-1 text-sm hover:bg-cloud disabled:opacity-40"
                      aria-label="Більше"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm tabular-nums text-ink">
                    {formatPrice(cartItemPriceUah(it))}
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
          <Link
            href="/checkout"
            onClick={onClose}
            className={`mt-4 flex h-12 w-full items-center justify-center bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 ${
              items.length === 0 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Оформити замовлення
          </Link>
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
