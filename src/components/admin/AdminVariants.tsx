"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, SlideOver } from "./intertop/primitives";

/** One product_variants row joined with its parent product. Mirror of
 *  lib/variants.ts AdminVariant. */
type Variant = {
  id: string;
  product_id: string;
  size: string;
  barcode: string;
  stock_qty: number;
  price: number | null;
  sale_price: number | null;
  active: boolean;
  updated_at?: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  status: string;
  base_price: number | null;
  image_src: string;
};

const PER_PAGE_OPTS = [20, 50, 100, 200];

export function AdminVariants({ onToast }: { onToast?: (m: string) => void }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [activeF, setActiveF] = useState("");
  const [stockF, setStockF] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk-edit draft — empty string means "leave unchanged".
  const [pStock, setPStock] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pSale, setPSale] = useState("");
  const [pActive, setPActive] = useState<"" | "1" | "0">("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (search.trim()) p.set("q", search.trim());
    if (activeF) p.set("active", activeF);
    if (stockF) p.set("inStock", stockF);
    try {
      const res = await fetch(`/api/admin/variants?${p}`);
      const data = await res.json();
      setRows(data.variants ?? []);
      setTotal(data.total ?? 0);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, activeF, stockF]);

  useEffect(() => { load(); }, [load]);

  function onSearch(v: string) {
    setSearchRaw(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  }

  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (rows.length > 0 && rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function applyBulk() {
    const patch: Record<string, unknown> = {};
    if (pStock !== "") patch.stock_qty = Math.max(0, Number(pStock) || 0);
    if (pPrice !== "") patch.price = Number(pPrice) || 0;
    if (pSale !== "") patch.sale_price = Number(pSale) || 0;
    if (pActive !== "") patch.active = pActive === "1";
    if (Object.keys(patch).length === 0) { onToast?.("Немає змін"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/variants/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], patch }),
      });
      const data = await res.json();
      if (res.ok) {
        onToast?.(`Оновлено пропозицій: ${data.count}`);
        setEditOpen(false);
        setPStock(""); setPPrice(""); setPSale(""); setPActive("");
        load();
      } else onToast?.(data.error ?? "Помилка");
    } finally { setSaving(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const pages: (number | "…")[] = [];
  const win = new Set([1, totalPages, page, page - 1, page + 1].filter((n) => n >= 1 && n <= totalPages));
  let prev = 0;
  for (let n = 1; n <= totalPages; n++) {
    if (!win.has(n)) continue;
    if (prev && n - prev > 1) pages.push("…");
    pages.push(n); prev = n;
  }

  const selCls = "h-9 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";
  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";
  const editLbl = "text-[11px] uppercase tracking-wider text-[#8a94a0]";
  const editInp = "mt-1 h-10 w-full rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";

  return (
    <div>
      <PageHeader
        title="Торгові пропозиції"
        subtitle={`${total.toLocaleString("uk-UA")} пропозицій · рівень розмірів`}
        onRefresh={load}
        right={
          <button
            disabled={selected.size === 0}
            onClick={() => setEditOpen(true)}
            className="flex h-9 items-center gap-2 rounded-[4px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-[0.08em] text-[#2f9488] transition-colors enabled:hover:bg-[#2f9488] enabled:hover:text-white disabled:opacity-40"
          >
            Редагувати ціни та залишки{selected.size ? ` (${selected.size})` : ""}
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={searchRaw} onChange={(e) => onSearch(e.target.value)}
          placeholder="Пошук: штрихкод, назва, код…"
          className="h-9 w-64 rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none"
        />
        <select value={activeF} onChange={(e) => { setActiveF(e.target.value); setPage(1); }} className={selCls}>
          <option value="">Активність: всі</option>
          <option value="1">Активні</option>
          <option value="0">Неактивні</option>
        </select>
        <select value={stockF} onChange={(e) => { setStockF(e.target.value); setPage(1); }} className={selCls}>
          <option value="">Залишок: всі</option>
          <option value="in">В наявності</option>
          <option value="out">Немає</option>
        </select>
        <button onClick={load} className="ml-auto flex h-9 items-center gap-1.5 rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Оновити
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-10 border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити всі" />
              </th>
              <th className={thCls}>Штрихкод</th>
              <th className={thCls}>Код товару</th>
              <th className={thCls}>Розмір</th>
              <th className={thCls}>Назва</th>
              <th className={thCls}>Категорія</th>
              <th className={`${thCls} text-right`}>Ціна, ₴</th>
              <th className={`${thCls} text-right`}>Акція, ₴</th>
              <th className={`${thCls} text-right`}>Залишок</th>
              <th className={thCls}>Активність</th>
              <th className={thCls}>Оновлено</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-12 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            ) : rows.map((v) => {
              const isSel = selected.has(v.id);
              const inherited = v.price == null;
              const shown = v.price ?? v.base_price;
              return (
                <tr key={v.id} className={`border-b border-[#eef2f3] transition-colors ${isSel ? "bg-[#eef7f6]" : "hover:bg-[#f7f9fa]"}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={isSel} onChange={() => toggleRow(v.id)} className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити рядок" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#2b2d42]">{v.barcode || `${v.sku}-${v.size}`}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{v.sku || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[#2b2d42]">{v.size || "—"}</td>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-[#2b2d42]" title={v.name}>{v.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">{v.category || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">
                    {shown != null ? shown.toLocaleString("uk-UA") : "—"}
                    {inherited && <span className="ml-1 text-[10px] text-[#aab4bf]" title="Успадковано від товару">↻</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#e5484d]">{v.sale_price != null ? v.sale_price.toLocaleString("uk-UA") : "—"}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${v.stock_qty > 0 ? "text-[#2b2d42]" : "text-[#aab4bf]"}`}>{v.stock_qty}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${v.active ? "bg-[#2f9488]" : "bg-[#c3ccd4]"}`} />
                      <span className="text-[12px] text-[#3a4250]">{v.active ? "Активна" : "Неактивна"}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-[#8a94a0]">{v.updated_at ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-[12px] text-[#5a6472]">
        <label className="flex items-center gap-2">
          Відображати на сторінці
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {PER_PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="tabular-nums text-[#8a94a0]">{from.toLocaleString("uk-UA")}–{to.toLocaleString("uk-UA")} / {total.toLocaleString("uk-UA")}</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">‹</button>
          {pages.map((p, i) => p === "…"
            ? <span key={`e${i}`} className="px-1 text-[#aab4bf]">…</span>
            : <button key={p} onClick={() => setPage(p)}
                className={`flex h-8 min-w-8 items-center justify-center rounded-[4px] border px-2 tabular-nums transition-colors ${p === page ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] bg-white text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]"}`}>{p}</button>)}
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">›</button>
        </div>
      </div>

      {/* Bulk edit slide-over */}
      <SlideOver
        open={editOpen}
        title={`Редагувати ціни та залишки · ${selected.size}`}
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button onClick={applyBulk} disabled={saving}
              className="h-11 flex-1 rounded-[4px] border border-[#2f9488] text-[11px] uppercase tracking-wider text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
              {saving ? "Зберігаємо…" : "Застосувати"}
            </button>
            <button onClick={() => setEditOpen(false)} className="h-11 rounded-[4px] border border-[#e6eaec] px-5 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
              Скасувати
            </button>
          </>
        }
      >
        <p className="mb-4 text-[12px] text-[#8a94a0]">Порожнє поле — не змінювати. Зміни застосуються до <b className="text-[#2b2d42]">{selected.size}</b> обраних пропозицій.</p>
        <div className="space-y-4">
          <label className="block"><span className={editLbl}>Залишок, шт</span>
            <input type="number" min={0} value={pStock} onChange={(e) => setPStock(e.target.value)} placeholder="без змін" className={editInp} /></label>
          <label className="block"><span className={editLbl}>Ціна, ₴</span>
            <input type="number" min={0} value={pPrice} onChange={(e) => setPPrice(e.target.value)} placeholder="без змін" className={editInp} /></label>
          <label className="block"><span className={editLbl}>Акційна ціна, ₴</span>
            <input type="number" min={0} value={pSale} onChange={(e) => setPSale(e.target.value)} placeholder="без змін" className={editInp} /></label>
          <label className="block"><span className={editLbl}>Активність</span>
            <select value={pActive} onChange={(e) => setPActive(e.target.value as "" | "1" | "0")} className={editInp}>
              <option value="">без змін</option>
              <option value="1">Активувати</option>
              <option value="0">Деактивувати</option>
            </select></label>
        </div>
      </SlideOver>
    </div>
  );
}
