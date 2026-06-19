"use client";

import { useState } from "react";
import type { SizeVariant } from "@/lib/productSource";

export function AddToCartButton({
  inStock,
  productId,
  sizes,
  sizeVariants,
}: {
  inStock: boolean;
  productId: number | string;
  sizes: string[];
  sizeVariants?: SizeVariant[];
}) {
  // Build availability map: size → {qty, inStock}
  const availMap = new Map<string, SizeVariant>(
    sizeVariants?.map((v) => [v.size, v]) ?? []
  );
  // Sizes to show: ERP variants (all) or fallback to sizes prop
  const displaySizes = sizeVariants && sizeVariants.length > 0
    ? sizeVariants.map((v) => v.size)
    : sizes;

  const firstAvailable = displaySizes.find((s) => availMap.get(s)?.inStock !== false && inStock);
  const [selected, setSelected] = useState<string | null>(firstAvailable ?? displaySizes[0] ?? null);
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const needsSize = displaySizes.length > 0;
  const selectedVariant = selected ? availMap.get(selected) : undefined;
  const selectedInStock = selectedVariant
    ? selectedVariant.inStock
    : inStock;
  const canAdd = selectedInStock && (!needsSize || !!selected);

  async function addToCart() {
    if (!canAdd) return;
    setStatus("loading");
    setError(null);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: String(productId), variation: selected ?? "", quantity: qty }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не вдалося додати товар");
      setStatus("idle");
      return;
    }
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: data.items_count } }));
    setStatus("done");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <>
      {needsSize && (
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Розмір</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {displaySizes.map((s) => {
              const variant = availMap.get(s);
              // If ERP data exists, use per-size inStock; else use global inStock
              const sizeInStock = variant ? variant.inStock : inStock;
              const isSelected = selected === s;
              return (
                <button
                  key={s}
                  onClick={() => sizeInStock && setSelected(s)}
                  title={!sizeInStock ? "Немає в наявності" : `${s}${variant?.qty != null ? ` — ${variant.qty} шт.` : ""}`}
                  className={`relative flex h-11 min-w-11 items-center justify-center border px-3 text-sm uppercase transition-colors
                    ${!sizeInStock
                      ? "border-line text-muted/50 cursor-not-allowed line-through"
                      : isSelected
                        ? "border-ink bg-ink text-paper"
                        : "border-line text-ink hover:border-ink"
                    }`}
                >
                  {s}
                  {!sizeInStock && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg viewBox="0 0 44 44" className="absolute h-full w-full opacity-20" stroke="currentColor" strokeWidth="1">
                        <line x1="0" y1="44" x2="44" y2="0" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selected && !selectedInStock && (
            <p className="mt-2 text-[12px] text-muted">Цей розмір тимчасово відсутній</p>
          )}
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <div className="flex items-center border border-line">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-12 w-10 items-center justify-center text-ink transition-colors hover:bg-cloud"
            aria-label="Зменшити кількість"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" strokeLinecap="round" /></svg>
          </button>
          <span className="w-10 text-center text-sm tabular-nums text-ink">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-12 w-10 items-center justify-center text-ink transition-colors hover:bg-cloud"
            aria-label="Збільшити кількість"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          </button>
        </div>

        <button
          onClick={addToCart}
          disabled={!canAdd || status === "loading"}
          className="h-12 flex-1 bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {!inStock
            ? "Немає в наявності"
            : !selectedInStock && selected
              ? "Розмір відсутній"
              : status === "loading"
                ? "Додаємо…"
                : status === "done"
                  ? "Додано ✓"
                  : "У кошик"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[#b3392c]">{error}</p>}
    </>
  );
}
