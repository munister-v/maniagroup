"use client";

import { useEffect, useState } from "react";

type SizeRow = { size?: string; label?: string; [key: string]: string | undefined };
type Chart = { id: string; brand: string; name: string; gender: string; chart: SizeRow[] };

/** Display labels for known property keys (mirrors lib/sizeCharts.ts's
 *  SIZE_CHART_TYPES, duplicated here since that file pulls in the DB pool
 *  and can't be imported into a client component) — unknown keys just show
 *  their raw key text, which still renders fine, just less polished. */
const PROPERTY_LABELS: Record<string, string> = {
  eu: "EU", us: "US", uk: "UK", cm: "CM",
  height: "Зріст", hips: "Обхват стегон", inseam: "Внутрішній шов", length: "Довжина виробу",
  head: "Обхват голови", eur: "EUR", intl: "Міжн. розмір", bust: "Обхват грудей", waist: "Обхват талії",
  foot_length: "Довжина стопи", insole_length: "Довжина устілки",
  finger: "Окружність пальця", diameter: "Діаметр виробу", set: "Комплект", kind: "Тип",
};

export function SizeChartButton({ brand, gender, sizeChartCode }: { brand: string; gender?: string; sizeChartCode?: string }) {
  const [open, setOpen] = useState(false);
  const [chart, setChart] = useState<Chart | null | "loading">("loading");

  useEffect(() => {
    const sp = new URLSearchParams({ brand });
    if (gender) sp.set("gender", gender);
    if (sizeChartCode) sp.set("code", sizeChartCode);
    fetch(`/api/size-chart?${sp}`)
      .then((r) => r.json())
      .then((d) => setChart(d))
      .catch(() => setChart(null));
  }, [brand, gender, sizeChartCode]);

  if (chart === "loading" || !chart) return null;

  const rows = chart.chart.map((r) => (r.size !== undefined ? r : { ...r, size: r.label }));
  const propKeys = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "size" && k !== "label" && r[k])))];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] uppercase tracking-luxe text-muted underline underline-offset-2 hover:text-ink transition-colors"
      >
        Таблиця розмірів
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg text-ink">
                {chart.name}
                {chart.brand && <span className="ml-2 text-sm text-muted font-sans">{chart.brand}</span>}
              </h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink text-xl leading-none">✕</button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                  <th className="pb-2 text-left font-normal">Розмір</th>
                  {propKeys.map((k) => <th key={k} className="pb-2 text-center font-normal">{PROPERTY_LABELS[k] ?? k}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium text-ink">{row.size}</td>
                    {propKeys.map((k) => <td key={k} className="py-2 text-center text-muted">{row[k] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-[11px] text-muted">
              Розміри можуть незначно відрізнятись залежно від моделі. У разі сумнівів — зателефонуйте нам.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
