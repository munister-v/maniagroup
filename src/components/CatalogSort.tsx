"use client";

import { useRouter } from "next/navigation";

/**
 * Native-select sort control for mobile. Sort options are server-built into
 * href strings; changing the select just navigates. Desktop uses the inline
 * link row in the catalog page instead.
 */
export function CatalogSort({
  value,
  options,
}: {
  value: string;
  options: { key: string; label: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <div className="relative shrink-0">
      <select
        aria-label="Сортування"
        value={value}
        onChange={(e) => {
          const o = options.find((opt) => opt.key === e.target.value);
          if (o) router.push(o.href);
        }}
        className="h-10 appearance-none border border-line bg-paper pl-4 pr-9 text-[11px] uppercase tracking-luxe text-ink focus:border-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
