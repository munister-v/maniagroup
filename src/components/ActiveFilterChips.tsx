"use client";

import { useRouter } from "next/navigation";
import { type ActiveFilters, catalogHref, hasAnyFilter } from "@/lib/catalogFilters";
import { colorLabel, swatchBackground, colorInfo } from "@/lib/colors";

const GENDER_LABEL: Record<string, string> = { women: "Жінкам", men: "Чоловікам" };
const SEASON_LABEL: Record<string, string> = { summer: "☀ Літо", winter: "❄ Зима" };

type Chip = { key: string; label: string; href: string; swatch?: string; ring?: boolean };

export function ActiveFilterChips({
  active,
  brandLabels,
  sizeLabels,
  categoryLabel,
}: {
  active: ActiveFilters;
  brandLabels: Record<string, string>;
  sizeLabels: Record<string, string>;
  categoryLabel?: string;
}) {
  const router = useRouter();
  if (!hasAnyFilter(active)) return null;

  const chips: Chip[] = [];

  if (active.brandGroup) {
    const label = active.brandGroup.charAt(0).toUpperCase() + active.brandGroup.slice(1);
    chips.push({ key: "bg", label, href: catalogHref(active, { brandGroup: undefined }) });
  }
  if (active.category) {
    chips.push({ key: "cat", label: categoryLabel ?? active.category, href: catalogHref(active, { category: undefined }) });
  }
  if (active.gender && GENDER_LABEL[active.gender]) {
    chips.push({ key: "gen", label: GENDER_LABEL[active.gender], href: catalogHref(active, { gender: undefined }) });
  }
  for (const slug of active.brands) {
    chips.push({
      key: `b-${slug}`,
      label: brandLabels[slug] ?? slug,
      href: catalogHref(active, { brands: active.brands.filter((s) => s !== slug) }),
    });
  }
  for (const name of active.colors) {
    chips.push({
      key: `c-${name}`,
      label: colorLabel(name),
      swatch: swatchBackground(name),
      ring: colorInfo(name).ring,
      href: catalogHref(active, { colors: active.colors.filter((c) => c !== name) }),
    });
  }
  for (const slug of active.sizes) {
    chips.push({
      key: `s-${slug}`,
      label: `Розмір ${sizeLabels[slug] ?? slug}`,
      href: catalogHref(active, { sizes: active.sizes.filter((s) => s !== slug) }),
    });
  }
  for (const slug of active.seasons) {
    chips.push({
      key: `season-${slug}`,
      label: SEASON_LABEL[slug] ?? slug,
      href: catalogHref(active, { seasons: active.seasons.filter((s) => s !== slug) }),
    });
  }
  if (active.inStock) {
    chips.push({ key: "stock", label: "В наявності", href: catalogHref(active, { inStock: false }) });
  }
  if (active.min || active.max) {
    const label = `${active.min ? active.min : "0"} – ${active.max ? active.max : "∞"} ₴`;
    chips.push({ key: "price", label, href: catalogHref(active, { min: undefined, max: undefined }) });
  }

  if (chips.length === 0) return null;

  const clearHref = catalogHref({
    ...active,
    category: undefined,
    brands: [],
    brandGroup: undefined,
    gender: undefined,
    colors: [],
    sizes: [],
    seasons: [],
    inStock: false,
    min: undefined,
    max: undefined,
  });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => router.push(c.href)}
          className="inline-flex items-center gap-1.5 border border-line bg-paper py-1.5 pl-2.5 pr-2 text-[11px] uppercase tracking-luxe text-ink transition-colors hover:border-ink"
        >
          {c.swatch && (
            <span
              className={`inline-block h-3 w-3 rounded-full ${c.ring ? "ring-1 ring-inset ring-line" : ""}`}
              style={{ background: c.swatch }}
            />
          )}
          {c.label}
          <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          onClick={() => router.push(clearHref)}
          className="link-underline ml-1 text-[11px] uppercase tracking-luxe text-muted hover:text-ink"
        >
          Скинути все
        </button>
      )}
    </div>
  );
}
