"use client";

import { useState } from "react";

type Variation = { id: number; attributes: { name: string; value: string }[] };
type SizeTerm = { id: number; name: string; slug: string };

export function AddToCartButton({
  inStock,
  productId,
  sizes,
  variations,
}: {
  inStock: boolean;
  productId: number;
  sizes: SizeTerm[];
  variations: Variation[];
}) {
  const [selected, setSelected] = useState<string | null>(sizes[0]?.slug ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const variationId =
    sizes.length === 0
      ? productId
      : variations.find((v) => v.attributes.some((a) => a.value === selected))?.id;

  async function addToCart() {
    if (!variationId) return;
    setStatus("loading");
    setError(null);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: variationId, quantity: 1 }),
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
      {sizes.length > 0 && (
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Розмір</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.slug)}
                className={`flex h-11 min-w-11 items-center justify-center border px-3 text-sm uppercase transition-colors ${
                  selected === s.slug ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={addToCart}
        disabled={!inStock || !variationId || status === "loading"}
        className="mt-8 h-12 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        {!inStock
          ? "Немає в наявності"
          : status === "loading"
            ? "Додаємо…"
            : status === "done"
              ? "Додано ✓"
              : "У кошик"}
      </button>

      {error && <p className="mt-3 text-sm text-[#b3392c]">{error}</p>}
    </>
  );
}
