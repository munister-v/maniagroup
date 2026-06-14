"use client";

import { useEffect, useRef, useState } from "react";
import type { NpCity, NpWarehouse } from "@/lib/novaposhta";

export type NpSelection = {
  city: string;
  area: string;
  warehouse: string;
  postcode: string;
};

export function NovaPoshtaPicker({ onChange }: { onChange: (s: NpSelection) => void }) {
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<NpCity[]>([]);
  const [openList, setOpenList] = useState(false);
  const [city, setCity] = useState<NpCity | null>(null);

  const [warehouses, setWarehouses] = useState<NpWarehouse[]>([]);
  const [whFilter, setWhFilter] = useState("");
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [loadingWh, setLoadingWh] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  // city autocomplete (debounced)
  useEffect(() => {
    if (city && query === city.name) return;
    if (query.trim().length < 2) {
      setCities([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/np/cities?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        setCities(await res.json());
        setOpenList(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, city]);

  // load warehouses when a city is chosen
  useEffect(() => {
    if (!city) return;
    setLoadingWh(true);
    setWarehouse(null);
    setWhFilter("");
    fetch(`/api/np/warehouses?ref=${encodeURIComponent(city.ref)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: NpWarehouse[]) => setWarehouses(data))
      .finally(() => setLoadingWh(false));
  }, [city]);

  // close dropdown on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pickCity(c: NpCity) {
    setCity(c);
    setQuery(c.name);
    setOpenList(false);
    onChange({ city: c.name, area: c.area, warehouse: "", postcode: "" });
  }

  function pickWarehouse(ref: string) {
    const wh = warehouses.find((w) => w.ref === ref) ?? null;
    setWarehouse(wh);
    if (city && wh) {
      onChange({ city: city.name, area: city.area, warehouse: wh.description, postcode: wh.postcode });
    }
  }

  const filteredWh = whFilter.trim()
    ? warehouses.filter((w) => w.description.toLowerCase().includes(whFilter.toLowerCase()))
    : warehouses;

  return (
    <div className="space-y-4">
      <div ref={boxRef} className="relative">
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Місто</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCity(null);
            }}
            onFocus={() => cities.length && setOpenList(true)}
            placeholder="Почніть вводити місто…"
            required
            autoComplete="off"
            className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </label>
        {openList && cities.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-line bg-paper shadow-lg">
            {cities.map((c) => (
              <li key={c.ref}>
                <button
                  type="button"
                  onClick={() => pickCity(c)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-ink hover:bg-cloud"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted">{c.area} обл.</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {city && (
        <div>
          <span className="text-[11px] uppercase tracking-luxe text-muted">Відділення Нової Пошти</span>
          {loadingWh ? (
            <p className="mt-2 text-sm text-muted">Завантаження відділень…</p>
          ) : (
            <>
              {warehouses.length > 8 && (
                <input
                  value={whFilter}
                  onChange={(e) => setWhFilter(e.target.value)}
                  placeholder="Пошук відділення за номером чи вулицею"
                  className="mt-2 h-10 w-full border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                />
              )}
              <select
                value={warehouse?.ref ?? ""}
                onChange={(e) => pickWarehouse(e.target.value)}
                required
                size={Math.min(6, Math.max(2, filteredWh.length))}
                className="mt-2 w-full border border-line bg-white px-2 py-1 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {filteredWh.length === 0 && <option value="">Нічого не знайдено</option>}
                {filteredWh.map((w) => (
                  <option key={w.ref} value={w.ref}>
                    {w.description}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
    </div>
  );
}
