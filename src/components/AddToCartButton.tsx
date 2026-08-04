"use client";

import { useState } from "react";
import type { SizeVariant } from "@/lib/productSource";

/**
 * Вибір розмірів і додавання в кошик.
 *
 * Лічильника кількості немає свідомо: в магазині одягу однакову річ рідко
 * беруть по кілька штук, натомість часто беруть той самий фасон у різних
 * розмірах. Тому розміри — множинний вибір: скільки відмітив, стільки позицій
 * і поїде в кошик, по одній штуці кожна. Кількість далі змінюється в кошику.
 */
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
  const availMap = new Map<string, SizeVariant>(sizeVariants?.map((v) => [v.size, v]) ?? []);
  const displaySizes = sizeVariants && sizeVariants.length > 0
    ? sizeVariants.map((v) => v.size)
    : sizes;

  const needsSize = displaySizes.length > 0;
  const sizeInStock = (s: string) => {
    const v = availMap.get(s);
    return v ? v.inStock : inStock;
  };

  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: string) => {
    if (!sizeInStock(s)) return;
    setError(null);
    setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  const canAdd = inStock && (!needsSize || selected.length > 0);

  async function addToCart() {
    if (!canAdd) return;
    setStatus("loading");
    setError(null);

    // Без розмірів — одна позиція; з розмірами — по позиції на кожен обраний.
    const picks = needsSize ? selected : [""];
    const failed: string[] = [];
    let itemsCount: number | undefined;

    for (const variation of picks) {
      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: String(productId), variation, quantity: 1 }),
        });
        const data = await res.json();
        if (!res.ok) { failed.push(variation || "товар"); continue; }
        itemsCount = data.items_count;
      } catch {
        failed.push(variation || "товар");
      }
    }

    // Частковий успіх — теж успіх: оновлюємо кошик і чесно кажемо, що не пройшло.
    if (itemsCount !== undefined) {
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: itemsCount } }));
    }
    if (failed.length === picks.length) {
      setError("Не вдалося додати товар");
      setStatus("idle");
      return;
    }
    if (failed.length > 0) setError(`Не додано: ${failed.join(", ")}`);

    setSelected([]);
    setStatus("done");
    setTimeout(() => setStatus("idle"), 1600);
  }

  return (
    <>
      {needsSize && (
        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] uppercase tracking-luxe text-muted">Розмір</p>
            <p className="text-[11px] text-muted">
              {selected.length > 0 ? `Обрано: ${selected.join(", ")}` : "Можна обрати кілька"}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {displaySizes.map((s) => {
              const available = sizeInStock(s);
              const isSelected = selected.includes(s);
              const variant = availMap.get(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggle(s)}
                  disabled={!available}
                  aria-pressed={isSelected}
                  title={!available ? "Немає в наявності" : `${s}${variant?.qty != null ? ` — ${variant.qty} шт.` : ""}`}
                  className={`relative flex h-12 min-w-12 items-center justify-center rounded-[2px] border px-3 text-sm uppercase transition-colors
                    ${!available
                      ? "cursor-not-allowed border-line text-muted/50 line-through"
                      : isSelected
                        ? "border-ink bg-ink text-paper"
                        : "border-line text-ink hover:border-ink"
                    }`}
                >
                  {s}
                  {!available && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 44 44" className="absolute h-full w-full opacity-20" stroke="currentColor" strokeWidth="1">
                        <line x1="0" y1="44" x2="44" y2="0" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={addToCart}
          disabled={!canAdd || status === "loading"}
          className="h-12 w-full rounded-[2px] bg-ink text-[12px] uppercase tracking-luxe text-paper transition-all hover:-translate-y-px hover:opacity-90 disabled:translate-y-0 disabled:opacity-40"
        >
          {!inStock
            ? "Немає в наявності"
            : needsSize && selected.length === 0
              ? "Оберіть розмір"
              : status === "loading"
                ? "Додаємо…"
                : status === "done"
                  ? "Додано ✓"
                  : selected.length > 1
                    ? `У кошик · ${selected.length} розміри`
                    : "У кошик"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[#b3392c]">{error}</p>}
    </>
  );
}
