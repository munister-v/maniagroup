"use client";

import { useEffect, useMemo, useState } from "react";
import { SubTabs } from "./intertop/primitives";

type PropKey = "brand" | "color" | "season" | "gender" | "country";
type PropValue = { name: string; count: number };
type PropsData = Record<PropKey, PropValue[]>;

const TABS: { id: PropKey; label: string }[] = [
  { id: "brand", label: "Бренд" },
  { id: "color", label: "Колір" },
  { id: "season", label: "Сезон" },
  { id: "gender", label: "Стать" },
  { id: "country", label: "Країна" },
];

const PER_PAGE_OPTS = [20, 50, 100];

export function AdminProperties() {
  const [data, setData] = useState<PropsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PropKey>("brand");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  useEffect(() => {
    fetch("/api/admin/products/properties")
      .then((r) => r.json())
      .then((d) => setData(d as PropsData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const values = data?.[tab] ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? values.filter((v) => v.name.toLowerCase().includes(q)) : values;
  }, [values, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [search, perPage, tab]);

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-[#2b2d42]">Властивості товарів</h2>
      <p className="mb-4 text-[12px] text-[#8a94a0]">Значення властивостей каталогу · {total.toLocaleString("uk-UA")}</p>

      <SubTabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук значення…"
          className="h-9 w-64 rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${thCls} w-16`}>#</th>
              <th className={thCls}>Значення</th>
              <th className={`${thCls} text-right`}>Товарів</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-12 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            ) : pageRows.map((v, i) => (
              <tr key={v.name} className="border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]">
                <td className="px-3 py-2.5 tabular-nums text-[#8a94a0]">{(page - 1) * perPage + i + 1}</td>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{v.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{v.count.toLocaleString("uk-UA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#5a6472]">
        <div className="flex items-center gap-1.5">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">‹</button>
          <span className="tabular-nums text-[#8a94a0]">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">›</button>
        </div>
        <label className="flex items-center gap-2">
          Відображати на сторінці
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}
            className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {PER_PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="ml-auto tabular-nums text-[#8a94a0]">Кількість записів: {total.toLocaleString("uk-UA")}</span>
      </div>
    </div>
  );
}
