"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Facets = {
  brands: { name: string; slug: string }[];
  categories?: { name: string; slug: string }[];
  sizes: { slug: string; name: string }[];
};

export type ActiveFilters = {
  category?: string;
  brand?: string;
  gender?: string;
  q?: string;
  sort?: string;
  size?: string;
  min?: string;
  max?: string;
};

export function CatalogFilters({
  facets,
  active,
}: {
  facets: Facets;
  active: ActiveFilters;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(active.min ?? "");
  const [max, setMax] = useState(active.max ?? "");

  function buildHref(overrides: Partial<ActiveFilters>) {
    const next = { ...active, ...overrides };
    const params = new URLSearchParams();
    if (next.category) params.set("category", next.category);
    if (next.brand) params.set("brand", next.brand);
    if (next.gender) params.set("gender", next.gender);
    if (next.q) params.set("q", next.q);
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    if (next.size) params.set("size", next.size);
    if (next.min) params.set("min", next.min);
    if (next.max) params.set("max", next.max);
    const qs = params.toString();
    return qs ? `/catalog?${qs}` : "/catalog";
  }

  function go(overrides: Partial<ActiveFilters>) {
    router.push(buildHref(overrides));
    setOpen(false);
  }

  const hasActive = active.size || active.min || active.max || active.brand || active.category || active.gender;
  const activeCount = [active.category, active.brand, active.gender, active.size, active.min || active.max].filter(Boolean).length;

  const renderBody = () => (
    <div className="space-y-8">
      {facets.categories && facets.categories.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-luxe text-muted">Категорії</h3>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {facets.categories.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => go({ category: active.category === c.slug ? undefined : c.slug })}
                  className={`text-sm transition-colors hover:text-ink ${
                    active.category === c.slug ? "text-ink underline underline-offset-4" : "text-muted"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-luxe text-muted">Бренди</h3>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <button
                  onClick={() => go({ brand: active.brand === b.slug ? undefined : b.slug })}
                  className={`text-sm transition-colors hover:text-ink ${
                    active.brand === b.slug ? "text-ink underline underline-offset-4" : "text-muted"
                  }`}
                >
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facets.sizes.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-luxe text-muted">Розмір</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {facets.sizes.map((s) => {
              const selected = active.size === s.slug;
              return (
                <button
                  key={s.slug}
                  onClick={() => go({ size: selected ? undefined : s.slug })}
                  className={`flex h-9 min-w-9 items-center justify-center border px-2.5 text-xs uppercase transition-colors ${
                    selected ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-[11px] uppercase tracking-luxe text-muted">Ціна, ₴</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ min: min || undefined, max: max || undefined });
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            type="number"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="від"
            className="h-9 w-full border border-line bg-white px-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <span className="text-muted">—</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="до"
            className="h-9 w-full border border-line bg-white px-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Застосувати"
            className="flex h-9 shrink-0 items-center bg-ink px-3 text-[11px] uppercase tracking-luxe text-paper hover:opacity-85"
          >
            OK
          </button>
        </form>
      </div>

      {hasActive && (
        <button
          onClick={() => {
            setMin("");
            setMax("");
            go({ size: undefined, min: undefined, max: undefined, brand: undefined, category: undefined, gender: undefined });
          }}
          className="link-underline text-[11px] uppercase tracking-luxe text-ink"
        >
          Скинути фільтри
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 border border-line px-4 text-[11px] uppercase tracking-luxe text-ink lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
        </svg>
        Фільтри
        {activeCount > 0 && (
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[9px] tabular-nums text-paper">
            {activeCount}
          </span>
        )}
      </button>

      {/* desktop sidebar */}
      <aside className="hidden lg:block">{renderBody()}</aside>

      {/* mobile drawer */}
      <div className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute left-0 top-0 flex h-full w-[85%] max-w-sm flex-col bg-paper shadow-2xl transition-transform duration-400 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-6 py-5">
            <h2 className="text-[12px] uppercase tracking-luxe text-ink">Фільтри</h2>
            <button onClick={() => setOpen(false)} aria-label="Закрити" className="text-ink hover:opacity-60">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{renderBody()}</div>
        </div>
      </div>
    </>
  );
}
