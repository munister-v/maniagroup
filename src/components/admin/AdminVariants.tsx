"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SlideOver } from "./intertop/primitives";

/** One product_variants row joined with its parent product. Mirror of
 *  lib/variants.ts AdminVariant. */
type Variant = {
  id: string;
  product_id: string;
  size: string;
  barcode: string;
  offer_code: string;
  stock_qty: number;
  price: number | null;
  sale_price: number | null;
  active: boolean;
  updated_at?: string;
  weight_pack: number | null;
  height_pack: number | null;
  width_pack: number | null;
  length_pack: number | null;
  sku: string;
  name: string;
  brand: string;
  category: string;
  category_slug: string;
  gender: string;
  factory_article: string;
  status: string;
  is_in_stock: boolean;
  base_price: number | null;
  image_src: string;
  moderation_status: string;
  subtype: string;
  material: string;
};

const PER_PAGE_OPTS = [20, 50, 100, 200];

const money = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(Number(n)).toLocaleString("uk-UA")} ₴`;

/** We store a flat category (+ gender) plus the newer `subtype` field, not
 *  Intertop's 4-level tree — present it Intertop-style as a short «{стать} /
 *  {категорія} / {підвид}» path rather than fake the missing levels. */
function classifierPath(v: Variant): string {
  const g = v.gender === "women" ? "Жінкам" : v.gender === "men" ? "Чоловікам" : "";
  return [g, v.category, v.subtype].filter(Boolean).join(" / ") || "—";
}

const dims = (n: number | null) => (n == null ? "—" : `${n} см`);
const kg = (n: number | null) => (n == null ? "—" : `${n} кг`);

/**
 * Full Intertop «Торгові пропозиції» column set, exposed via the «Колонки»
 * chooser (core columns — checkbox, Внутр. номер, SKU, Заводський артикул,
 * Штрихкод, Розмір, Активність, Статус — are always shown, see the table
 * head below). Columns we have real data for render it; weightPack/
 * heightPack/widthPack/lengthPack come from the same product_variants
 * columns the «Створити торгову пропозицію» panel writes (see
 * lib/variants.ts) — kept in sync so a value entered there is actually
 * visible here, not silently dropped. Dimensions we never modeled (net
 * weight/volume, pillow size, diameter, bonus program, margin — see
 * lib/classifierTree.ts's fill-rate audit, ~0% used even by Intertop for
 * clothing) still render «—», so the chooser keeps 1:1 column parity
 * without pretending we store data we don't.
 */
type OptCol =
  | "category" | "classifier" | "material" | "factoryArticle" | "size" | "sizeClothing"
  | "price" | "salePrice" | "stock" | "nameUk" | "nameRu"
  | "heightNet" | "widthNet" | "lengthNet" | "diameterNet" | "volumeNet" | "weightNet"
  | "pillowSize" | "weightPack" | "heightPack" | "lengthPack" | "widthPack" | "diameterPack"
  | "bonusProgramId" | "margin";

const OPT_COLS: {
  id: OptCol; label: string; hideDefault?: boolean; align?: "right";
  render: (v: Variant) => ReactNode;
}[] = [
  { id: "category",       label: "Категорія",              render: (v) => v.category || "—" },
  { id: "classifier",     label: "Класифікатор",           render: (v) => classifierPath(v) },
  { id: "material",       label: "Матеріал верху", hideDefault: true, render: (v) => v.material || "—" },
  { id: "sizeClothing",   label: "Розмір одягу", hideDefault: true, render: (v) => v.size || "—" },
  { id: "price",          label: "Ціна",           align: "right", render: (v) => money(v.price ?? v.base_price) },
  { id: "salePrice",      label: "Акційна ціна",   align: "right", render: (v) => (v.sale_price ? money(v.sale_price) : "—") },
  { id: "stock",          label: "Залишок на гол. складі", align: "right", render: (v) => v.stock_qty.toLocaleString("uk-UA") },
  { id: "nameUk",         label: "Назва (укр.)", hideDefault: true, render: () => "—" },
  { id: "nameRu",         label: "Назва (рос.)",           render: (v) => v.name },
  { id: "heightNet",      label: "Висота нетто",       hideDefault: true, render: () => "—" },
  { id: "widthNet",       label: "Ширина нетто",       hideDefault: true, render: () => "—" },
  { id: "lengthNet",      label: "Довжина нетто",      hideDefault: true, render: () => "—" },
  { id: "diameterNet",    label: "Діаметр нетто",      hideDefault: true, render: () => "—" },
  { id: "volumeNet",      label: "Об'єм нетто",        hideDefault: true, render: () => "—" },
  { id: "weightNet",      label: "Вага нетто",         hideDefault: true, render: () => "—" },
  { id: "pillowSize",     label: "Розмір наволочки",   hideDefault: true, render: () => "—" },
  { id: "weightPack",     label: "Вага в упаковці",    hideDefault: true, render: (v) => kg(v.weight_pack) },
  { id: "heightPack",     label: "Висота в упаковці",  hideDefault: true, render: (v) => dims(v.height_pack) },
  { id: "lengthPack",     label: "Довжина в упаковці", hideDefault: true, render: (v) => dims(v.length_pack) },
  { id: "widthPack",      label: "Ширина в упаковці",  hideDefault: true, render: (v) => dims(v.width_pack) },
  { id: "diameterPack",   label: "Діаметр в упаковці", hideDefault: true, render: () => "—" },
  { id: "bonusProgramId", label: "ID бонусної програми", hideDefault: true, render: () => "—" },
  { id: "margin",         label: "Маржинальність",     hideDefault: true, render: () => "—" },
];

/** Faithful 1:1 clone of Intertop partner «Торгові пропозиції». */
export function AdminVariants({ onToast, onImport }: { onToast?: (m: string) => void; onImport?: () => void }) {
  const [rows, setRows] = useState<Variant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [perPage, setPerPage] = useState(20);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [activeF, setActiveF] = useState("");
  const [stockF, setStockF] = useState("");
  const [catF, setCatF] = useState("");
  const [siteF, setSiteF] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<OptCol>>(() => new Set(OPT_COLS.filter((c) => c.hideDefault).map((c) => c.id)));
  const [editOpen, setEditOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk-edit draft — empty string means "leave unchanged".
  const [pStock, setPStock] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pSale, setPSale] = useState("");
  const [pActive, setPActive] = useState<"" | "1" | "0">("");
  const [saving, setSaving] = useState(false);

  // Export drawer state.
  const [exFormat, setExFormat] = useState("");
  const [exType, setExType] = useState("");
  const [exTouched, setExTouched] = useState(false);

  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json())
      .then((d) => setCats([...new Set((d.categories ?? []).map((c: { name: string }) => c.name).filter(Boolean) as string[])].sort()))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (search.trim()) p.set("q", search.trim());
    if (activeF) p.set("active", activeF);
    if (stockF) p.set("inStock", stockF);
    if (catF) p.set("category", catF);
    if (siteF) p.set("siteStatus", siteF);
    try {
      const res = await fetch(`/api/admin/variants?${p}`);
      const data = await res.json();
      setRows(data.variants ?? []);
      setTotal(data.total ?? 0);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, activeF, stockF, catF, siteF]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPageInput(String(page)); }, [page]);

  function onSearch(v: string) {
    setSearchRaw(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); setSearch(v); }, 350);
  }

  function resetFilters() {
    setSearchRaw(""); setSearch(""); setActiveF(""); setStockF(""); setCatF(""); setSiteF(""); setPage(1);
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

  function runExport() {
    setExTouched(true);
    if (!exFormat || !exType) return;
    const fmt = exFormat === "XML" ? "xml" : exFormat === "CSV" ? "csv" : "xlsx";
    const p = new URLSearchParams({ format: fmt, scope: "all", requireImage: "0" });
    if (exType === "selected") {
      const ids = [...new Set(rows.filter((r) => selected.has(r.id)).map((r) => r.product_id))];
      if (ids.length === 0) { onToast?.("Немає обраних пропозицій"); return; }
      p.set("ids", ids.join(","));
    }
    window.location.assign(`/api/erp/export?${p}`);
    onToast?.("Формуємо файл експорту…");
    setExportOpen(false);
    setExFormat(""); setExType(""); setExTouched(false);
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const show = (c: OptCol) => !hidden.has(c);
  const visibleCols = OPT_COLS.filter((c) => !hidden.has(c.id));
  // checkbox + Внутр. номер + SKU + Заводський артикул + Штрихкод + Розмір + Активність + Статус
  const colSpan = 8 + visibleCols.length;

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";
  const selCls = "h-9 rounded-[4px] border border-[#e6eaec] bg-white px-2.5 text-[12px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";
  const ghostBtn = "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#8a94a0] transition-colors hover:text-[#2b2d42]";
  const editLbl = "text-[11px] uppercase tracking-wider text-[#8a94a0]";
  const editInp = "mt-1 h-10 w-full rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none";

  // Matches AdminProducts.tsx's moderationLabel() vocabulary — a variant's
  // parent product goes through the same Intertop 2.1/2.2 moderation state
  // machine, so a variant of a product still «На модерації» should read that
  // way here too, not get collapsed into a generic «Чернетка» like it used
  // to be (that made every unmoderated product's offers look identical to a
  // plain, never-submitted draft).
  function siteStatus(v: Variant): { label: string; color: string } {
    if (v.moderation_status === "pending") return { label: "На модерації", color: "#d97706" };
    if (v.moderation_status === "rejected") return { label: "Не підтверджено", color: "#e5484d" };
    if (v.moderation_status !== "approved") return { label: "Чернетка", color: "#8a94a0" };
    if (v.status === "publish" && v.active && v.is_in_stock) return { label: "На сайті", color: "#2f9488" };
    if (v.status !== "publish") return { label: "Підтверджено", color: "#2f9488" };
    if (!v.active) return { label: "Неактивна", color: "#c3ccd4" };
    return { label: "Без залишку", color: "#b6c0ca" };
  }

  return (
    <div>
      {/* ── Header: title + quick search + help · edit-prices + kebab ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Торгові пропозиції</h1>
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#aab4bf]" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
            <input value={searchRaw} onChange={(e) => onSearch(e.target.value)} placeholder="Швидкий пошук"
              className="h-9 w-64 rounded-[4px] border border-[#e6eaec] bg-white pl-9 pr-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none" />
          </div>
          <span title="Пошук за штрихкодом, кодом товару, назвою або розміром"
            className="flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[#c3ccd4] text-[11px] text-[#8a94a0]">?</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button disabled={selected.size === 0} onClick={() => setEditOpen(true)}
            className="flex h-9 items-center rounded-[4px] border border-[#2f9488] px-4 text-[11px] font-medium uppercase tracking-[0.06em] text-[#2f9488] transition-colors enabled:hover:bg-[#2f9488] enabled:hover:text-white disabled:cursor-not-allowed disabled:border-[#e6eaec] disabled:text-[#c3ccd4]">
            Редагувати ціни та залишки{selected.size ? ` (${selected.size})` : ""}
          </button>
          <div className="relative">
            <button onClick={() => setKebabOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#e6eaec] text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]" aria-label="Меню">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
            </button>
            {kebabOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setKebabOpen(false)} />
                <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-[5px] border border-[#e6eaec] bg-white py-1 shadow-lg">
                  <button onClick={() => { setKebabOpen(false); onImport?.(); }} className="block w-full px-4 py-2 text-left text-[13px] text-[#2b2d42] hover:bg-[#f7f9fa]">Імпорт файлу</button>
                  <button onClick={() => { setKebabOpen(false); setExportOpen(true); }} className="block w-full px-4 py-2 text-left text-[13px] text-[#2b2d42] hover:bg-[#f7f9fa]">Експорт даних</button>
                  <button onClick={() => { setKebabOpen(false); onToast?.("Джерело даних: PostgreSQL · maniagroup"); }} className="block w-full px-4 py-2 text-left text-[13px] text-[#2b2d42] hover:bg-[#f7f9fa]">Джерело даних</button>
                  <button disabled className="block w-full px-4 py-2 text-left text-[13px] text-[#c3ccd4]">Видалити</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFiltersOpen((v) => !v)}
            className={`flex h-9 items-center gap-1.5 rounded-[4px] px-3.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${filtersOpen ? "bg-[#2b2d42] text-white" : "bg-[#2b2d42] text-white hover:bg-[#3a4250]"}`}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Фільтри
          </button>
          <select value={catF} onChange={(e) => { setCatF(e.target.value); setPage(1); }} className={selCls}>
            <option value="">Категорія</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={siteF} onChange={(e) => { setSiteF(e.target.value); setPage(1); }} className={selCls}>
            <option value="">Статус</option>
            <option value="live">На сайті</option>
            <option value="hidden">Прихована</option>
          </select>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={load} className={ghostBtn}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Оновити
          </button>
          <div className="relative">
            <button onClick={() => setColsOpen((v) => !v)} className={ghostBtn}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16M4 12h16M4 19h16M9 5v14" strokeLinecap="round" /></svg>
              Колонки
            </button>
            {colsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColsOpen(false)} />
                <div className="absolute right-0 z-30 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-[5px] border border-[#e6eaec] bg-white p-2 shadow-lg">
                  {OPT_COLS.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-[#2b2d42] hover:bg-[#f7f9fa]">
                      <input type="checkbox" checked={show(c.id)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="h-3.5 w-3.5 accent-[#2f9488]" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={resetFilters} className={ghostBtn}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
            Параметри
          </button>
        </div>
      </div>

      {/* Advanced filters (behind «Фільтри») */}
      {filtersOpen && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[5px] border border-[#e6eaec] bg-[#f7f9fa] px-3 py-2.5">
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
          <button onClick={resetFilters} className="ml-auto text-[12px] text-[#8a94a0] hover:text-[#2b2d42]">Скинути</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-10 border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити всі" />
              </th>
              <th className={thCls}>Внутр. номер</th>
              <th className={thCls}>SKU</th>
              <th className={thCls}>Заводський артикул</th>
              <th className={thCls}>Штрихкод</th>
              <th className={thCls}>Розмір</th>
              <th className={thCls}>Активність</th>
              <th className={thCls}>Статус</th>
              {visibleCols.map((c) => (
                <th key={c.id} className={c.align === "right" ? `${thCls} text-right` : thCls}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={colSpan} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-3 py-12 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            ) : rows.map((v) => {
              const isSel = selected.has(v.id);
              const st = siteStatus(v);
              // Наша структура ідентифікаторів (не Intertop-mp): внутрішній номер =
              // тільки цифри (v.sku), SKU = номер + розмір (45678-M). v.sku буває
              // порожнім у старих товарів — падаємо на product_id, щоб не показати
              // голий "-M".
              const innerNo = v.sku || v.product_id;
              const skuCode = `${innerNo}-${v.size}`;
              return (
                <tr key={v.id} className={`border-b border-[#eef2f3] transition-colors ${isSel ? "bg-[#eef7f6]" : "hover:bg-[#f7f9fa]"}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={isSel} onChange={() => toggleRow(v.id)} className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити рядок" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <button onClick={() => { setSelected(new Set([v.id])); setEditOpen(true); }}
                      className="font-mono text-[12px] text-[#2f9488] hover:underline">{innerNo}</button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#2b2d42]">{skuCode}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{v.factory_article || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{v.barcode || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">{v.size || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">{v.active ? "Так" : "Ні"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.color }} />
                      <span className="text-[12px] text-[#3a4250]">{st.label}</span>
                    </span>
                  </td>
                  {visibleCols.map((c) => (
                    <td key={c.id} className={`whitespace-nowrap px-3 py-2.5 text-[#5a6472] ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {c.render(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination footer (Intertop bottom bar) ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#5a6472]">
        <div className="flex items-center gap-1.5">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">‹</button>
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { const n = Math.min(totalPages, Math.max(1, Number(pageInput) || 1)); setPage(n); } }}
            onBlur={() => { const n = Math.min(totalPages, Math.max(1, Number(pageInput) || 1)); setPage(n); }}
            className="h-8 w-14 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-center tabular-nums text-[#2b2d42] focus:border-[#2f9488] focus:outline-none" />
          <span className="tabular-nums text-[#8a94a0]">/ {totalPages.toLocaleString("uk-UA")}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">›</button>
        </div>
        <label className="flex items-center gap-2">
          Відображати на сторінці
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {PER_PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="ml-auto tabular-nums text-[#8a94a0]">Кількість записів: {total.toLocaleString("uk-UA")}</span>
      </div>

      {/* ── Export drawer ── */}
      <SlideOver
        open={exportOpen}
        title="Експорт торгових пропозицій"
        onClose={() => { setExportOpen(false); setExTouched(false); }}
        footer={
          <>
            <button onClick={runExport} disabled={!exFormat || !exType}
              className="h-11 flex-1 rounded-[4px] border border-[#2f9488] text-[11px] uppercase tracking-wider text-[#2f9488] transition-colors enabled:hover:bg-[#2f9488] enabled:hover:text-white disabled:cursor-not-allowed disabled:border-[#e6eaec] disabled:text-[#c3ccd4]">
              Експортувати
            </button>
            <button onClick={() => { setExportOpen(false); setExTouched(false); }} className="h-11 rounded-[4px] border border-[#e6eaec] px-5 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
              Закрити
            </button>
          </>
        }
      >
        <p className="mb-5 text-[13px] leading-relaxed text-[#5a6472]">Щоб експортувати торгові пропозиції, оберіть формат файлу та тип шаблону</p>
        <div className="space-y-4">
          <label className="block">
            <span className={editLbl}>Формат файлу *</span>
            <select value={exFormat} onChange={(e) => setExFormat(e.target.value)}
              className={`${editInp} ${exTouched && !exFormat ? "border-[#e5484d]" : ""}`}>
              <option value="">—</option>
              <option value="XML">XML</option>
              <option value="CSV">CSV</option>
              <option value="XLSX">XLSX</option>
            </select>
            {exTouched && !exFormat && <span className="mt-1 block text-[11px] text-[#e5484d]">Поле обов&apos;язкове</span>}
          </label>
          <label className="block">
            <span className={editLbl}>Тип *</span>
            <select value={exType} onChange={(e) => setExType(e.target.value)}
              className={`${editInp} ${exTouched && !exType ? "border-[#e5484d]" : ""}`}>
              <option value="">—</option>
              <option value="all">Усі торгові пропозиції</option>
              <option value="selected">Обрані торгові пропозиції{selected.size ? ` (${selected.size})` : ""}</option>
            </select>
            {exTouched && !exType && <span className="mt-1 block text-[11px] text-[#e5484d]">Поле обов&apos;язкове</span>}
          </label>
        </div>
      </SlideOver>

      {/* ── Bulk edit slide-over ── */}
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
