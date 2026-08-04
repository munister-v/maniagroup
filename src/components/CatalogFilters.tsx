"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  type ActiveFilters,
  catalogHref,
  toggleInList,
  activeCount,
  hasAnyFilter,
} from "@/lib/catalogFilters";
import { colorLabel, swatchBackground, colorInfo } from "@/lib/colors";

export type { ActiveFilters };

export type Facets = {
  brands: { name: string; slug: string; count?: number }[];
  categories?: { name: string; slug: string }[];
  sizes: { slug: string; name: string }[];
  colors?: { name: string; count?: number }[];
  seasons?: { slug: string; name: string; count?: number }[];
  priceRange?: { min: number; max: number };
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

  function go(patch: Partial<ActiveFilters>) {
    router.push(catalogHref(active, patch));
    setOpen(false);
  }

  const range = facets.priceRange;

  const renderBody = () => (
    <div className="divide-y divide-line/70">
      {/* Quick toggles */}
      <div className="space-y-3 pb-6">
        <button type="button" onClick={() => go({ inStock: !active.inStock })} className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-[3px] px-1 text-left transition-colors hover:bg-cloud/50">
          <span className="text-sm text-ink">Тільки в наявності</span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              active.inStock ? "bg-ink" : "bg-line"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${
                active.inStock ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
        <button type="button" onClick={() => go({ onSale: !active.onSale })} className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-2 rounded-[3px] px-1 text-left transition-colors hover:bg-cloud/50">
          <span className="flex items-center gap-2 text-sm text-ink">
            Тільки зі знижкою
            <span className="bg-[var(--color-sale)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-luxe text-white">Sale</span>
          </span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              active.onSale ? "bg-[var(--color-sale)]" : "bg-line"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-paper transition-transform ${
                active.onSale ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </div>

      {facets.categories && facets.categories.length > 0 && (
        <Section title="Категорії">
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {facets.categories.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => go({ category: active.category === c.slug ? undefined : c.slug })}
                    className={`min-h-9 text-left text-sm transition-colors hover:text-ink ${
                    active.category === c.slug ? "text-ink underline underline-offset-4" : "text-muted"
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facets.brands.length > 0 && (
        <Section title="Бренди">
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {facets.brands.map((b) => {
              const checked = active.brands.includes(b.slug);
              return (
                <li key={b.slug}>
                  <button
                    onClick={() => go({ brands: toggleInList(active.brands, b.slug), brandGroup: undefined })}
                    className="group flex min-h-9 w-full items-center gap-2.5 rounded-[3px] text-left transition-colors hover:bg-cloud/45"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center border transition-colors ${
                        checked ? "border-ink bg-ink text-paper" : "border-line group-hover:border-ink"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-sm transition-colors ${checked ? "text-ink" : "text-muted group-hover:text-ink"}`}>
                      {b.name}
                    </span>
                    {b.count != null && <span className="ml-auto text-[11px] tabular-nums text-muted/50">{b.count}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {facets.colors && facets.colors.length > 0 && (
        <Section title="Колір">
          <div className="flex flex-wrap gap-2">
            {facets.colors.map((c) => {
              const selected = active.colors.includes(c.name);
              const info = colorInfo(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => go({ colors: toggleInList(active.colors, c.name) })}
                  aria-pressed={selected}
                  className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-[11px] uppercase tracking-luxe transition-colors ${
                    selected ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                  }`}
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${info.ring ? "ring-1 ring-inset ring-line" : ""}`}
                    style={{ background: swatchBackground(c.name) }}
                  />
                  {colorLabel(c.name)}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {facets.sizes.length > 0 && (
        <Section title="Розмір">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => {
              const selected = active.sizes.includes(s.slug);
              return (
                <button
                  key={s.slug}
                  onClick={() => go({ sizes: toggleInList(active.sizes, s.slug) })}
                  className={`flex h-11 min-w-11 items-center justify-center rounded-[2px] border px-2.5 text-xs uppercase transition-colors ${
                    selected ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {facets.seasons && facets.seasons.length > 0 && (
        <Section title="Сезон">
          <div className="flex flex-wrap gap-2">
            {facets.seasons.map((s) => {
              const selected = active.seasons.includes(s.slug);
              return (
                <button
                  key={s.slug}
                  onClick={() => go({ seasons: toggleInList(active.seasons, s.slug) })}
                  className={`flex h-11 items-center gap-1.5 rounded-full border px-4 text-[11px] uppercase tracking-luxe transition-colors ${
                    selected ? "border-ink bg-ink text-paper" : "border-line text-ink hover:border-ink"
                  }`}
                >
                  {s.slug === "summer" ? "☀" : "❄"} {s.name}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Ціна, ₴">
        {range && range.max > range.min && (
          <PriceSlider
            min={range.min}
            max={range.max}
            lo={min ? Math.max(range.min, Number(min)) : range.min}
            hi={max ? Math.min(range.max, Number(max)) : range.max}
            onInput={(lo, hi) => { setMin(String(lo)); setMax(String(hi)); }}
            onCommit={(lo, hi) => go({ min: lo > range.min ? String(lo) : undefined, max: hi < range.max ? String(hi) : undefined })}
          />
        )}
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
            placeholder={range ? `від ${range.min}` : "від"}
            className="h-11 w-full rounded-[2px] border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <span className="text-muted">—</span>
          <input
            type="number"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={range ? `до ${range.max}` : "до"}
            className="h-11 w-full rounded-[2px] border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Застосувати"
            className="flex h-11 shrink-0 items-center rounded-[2px] bg-ink px-4 text-[11px] uppercase tracking-luxe text-paper hover:opacity-85"
          >
            OK
          </button>
        </form>
      </Section>

      {hasAnyFilter(active) && (
        <div className="pt-6">
          <button
            onClick={() => {
              setMin("");
              setMax("");
              go({
                category: undefined,
                brands: [],
                brandGroup: undefined,
                gender: undefined,
                colors: [],
                sizes: [],
                seasons: [],
                inStock: false,
                onSale: false,
                min: undefined,
                max: undefined,
              });
            }}
            className="link-underline text-[11px] uppercase tracking-luxe text-ink"
          >
            Скинути фільтри
          </button>
        </div>
      )}
    </div>
  );

  const count = activeCount(active);

  return (
    <>
      {/* mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-2 rounded-full border border-line bg-white/70 px-4 text-[11px] uppercase tracking-luxe text-ink shadow-[0_8px_24px_-20px_rgba(26,23,20,0.55)] backdrop-blur lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
        </svg>
        Фільтри
        {count > 0 && (
          <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[9px] tabular-nums text-paper">
            {count}
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
          className={`absolute left-0 top-0 flex h-full w-[88%] max-w-sm flex-col bg-paper shadow-[0_28px_80px_-34px_rgba(26,23,20,0.75)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[12px] uppercase tracking-luxe text-ink">Фільтри</h2>
            <button onClick={() => setOpen(false)} aria-label="Закрити" className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-cloud">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{renderBody()}</div>
        </div>
      </div>
    </>
  );
}

/**
 * Collapsible filter section — clean white accordion with a chevron.
 * Open by default; the header toggles visibility of the body.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
      <div className="py-5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between rounded-[3px] text-left"
      >
        <span className="text-[11px] uppercase tracking-luxe text-ink">{title}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Фіксована max-height була потрібна лише для анімації згортання, але
          вона різала довгі списки (кольорів більше, ніж 640 px). grid-rows
          анімує так само плавно й не обмежує висоту вмісту. */}
      <div
        className={`grid transition-[grid-template-rows,margin] duration-300 ease-out ${
          open ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/**
 * Dual-handle price range slider. Two overlaid range inputs share a track;
 * `onInput` fires live (to update the numeric fields), `onCommit` on release
 * (to navigate). Values are clamped so the handles can't cross.
 */
function PriceSlider({
  min,
  max,
  lo,
  hi,
  onInput,
  onCommit,
}: {
  min: number;
  max: number;
  lo: number;
  hi: number;
  onInput: (lo: number, hi: number) => void;
  onCommit: (lo: number, hi: number) => void;
}) {
  const span = Math.max(1, max - min);
  const step = Math.max(1, Math.round(span / 100));
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  return (
    <div className="mt-4 px-1">
      <div className="relative h-5">
        {/* track */}
        <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-line" />
        {/* active fill */}
        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onInput(Math.min(Number(e.target.value), hi - step), hi)}
          onMouseUp={(e) => onCommit(Math.min(Number((e.target as HTMLInputElement).value), hi - step), hi)}
          onTouchEnd={(e) => onCommit(Math.min(Number((e.target as HTMLInputElement).value), hi - step), hi)}
          className="price-thumb pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label="Мінімальна ціна"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onInput(lo, Math.max(Number(e.target.value), lo + step))}
          onMouseUp={(e) => onCommit(lo, Math.max(Number((e.target as HTMLInputElement).value), lo + step))}
          onTouchEnd={(e) => onCommit(lo, Math.max(Number((e.target as HTMLInputElement).value), lo + step))}
          className="price-thumb pointer-events-none absolute top-0 h-5 w-full appearance-none bg-transparent"
          aria-label="Максимальна ціна"
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
        <span>{lo.toLocaleString("uk-UA")} ₴</span>
        <span>{hi.toLocaleString("uk-UA")} ₴</span>
      </div>
    </div>
  );
}
