"use client";

import { useEffect, useState } from "react";

type SizeRow = { label: string; eu?: string; us?: string; uk?: string; cm?: string };
type Chart = { id: string; brand: string; name: string; gender: string; chart: SizeRow[] };

export function SizeChartButton({ brand, gender }: { brand: string; gender?: string }) {
  const [open, setOpen] = useState(false);
  const [chart, setChart] = useState<Chart | null | "loading">("loading");

  useEffect(() => {
    const sp = new URLSearchParams({ brand });
    if (gender) sp.set("gender", gender);
    fetch(`/api/size-chart?${sp}`)
      .then((r) => r.json())
      .then((d) => setChart(d))
      .catch(() => setChart(null));
  }, [brand, gender]);

  if (chart === "loading" || !chart) return null;

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
                  {chart.chart[0]?.eu && <th className="pb-2 text-center font-normal">EU</th>}
                  {chart.chart[0]?.us && <th className="pb-2 text-center font-normal">US</th>}
                  {chart.chart[0]?.uk && <th className="pb-2 text-center font-normal">UK</th>}
                  {chart.chart[0]?.cm && <th className="pb-2 text-center font-normal">CM</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {chart.chart.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium text-ink">{row.label}</td>
                    {row.eu !== undefined && <td className="py-2 text-center text-muted">{row.eu || "—"}</td>}
                    {row.us !== undefined && <td className="py-2 text-center text-muted">{row.us || "—"}</td>}
                    {row.uk !== undefined && <td className="py-2 text-center text-muted">{row.uk || "—"}</td>}
                    {row.cm !== undefined && <td className="py-2 text-center text-muted">{row.cm || "—"}</td>}
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
