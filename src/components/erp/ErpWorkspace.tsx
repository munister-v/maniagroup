"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ErpOverview } from "./ErpOverview";
import { ErpReceiving } from "./ErpReceiving";
import { ErpStocktake } from "./ErpStocktake";
import { ErpSuppliers } from "./ErpSuppliers";
import { ErpChannels } from "./ErpChannels";
import { ErpPurchasing } from "./ErpPurchasing";
import { ErpReplenishment } from "./ErpReplenishment";
import { ErpProductCreate } from "./ErpProductCreate";
import { ErpImportTabs } from "./ErpImportTabs";
import { ErpGrid } from "./ErpGrid";
import { ErpReturns } from "./ErpReturns";
import { ErpReports } from "./ErpReports";
import { ErpPriceRules } from "./ErpPriceRules";
import { ErpSizeCharts } from "./ErpSizeCharts";
import { ErpEmailTemplates } from "./ErpEmailTemplates";
import { ErpCategories } from "./ErpCategories";
import { aiAutofill, aiDescription } from "./aiAssist";

/* ── types ──────────────────────────────────────────────────────────────── */

type Overview = { skus: string; in_stock: string; out_stock: string; units: string; variants: string };
type ProductRow = {
  id: string; name: string; brand: string; sku: string; factory_article: string;
  category: string; color: string; season: string;
  status: string; price: number; image_src: string; is_in_stock: boolean;
  stock_qty: number; variant_count: number; variant_units: number;
  created_at: string; updated_at: string;
};
type Variant = {
  id: number; size: string; barcode: string; offer_code: string; stock_qty: number;
  price: number | null; sale_price: number | null; active: boolean; updated_at: string; updated_by: string;
};
type Movement = {
  id: number; size: string; type: string; delta: number; qty_after: number | null;
  note: string; author: string; created_at: string;
};
type ProductDetail = {
  id: string; name: string; brand: string; sku: string; factory_article: string;
  category: string; gender: string; status: string;
  price: string; regular_price: string; sale_price: string | null; cost_price: string | null;
  image_src: string; images: { src?: string }[] | string; is_in_stock: boolean; stock_qty: string;
  color: string; composition: string; season: string; country: string;
  collection: string; description: string; created_at: string; updated_at: string;
  meta_title: string; meta_description: string;
};
type Detail = {
  product: ProductDetail;
  variants: Variant[];
  movements: Movement[];
};
type Facets = { brands: string[]; categories: { name: string }[]; colors: string[]; seasons: string[] };

const MOVE_LABEL: Record<string, string> = {
  import: "Імпорт", receipt: "Прихід", sale: "Продаж",
  return: "Повернення", adjust: "Коригування", writeoff: "Списання",
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function dmy(s: string) { return s ? new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"; }
const inp = "h-9 rounded-[3px] border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

/** Compact numbered pagination. */
function pageList(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, page - 1), hi = Math.min(total - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

/* ── product lifecycle ───────────────────────────────────────────────────── */
type ErpStatus = "draft" | "moderation" | "publish" | "inactive";
const STATUS_LABEL: Record<ErpStatus, string> = {
  draft: "Чернетка", moderation: "На модерації", publish: "Активний", inactive: "Деактивований",
};
const STATUS_COLOR: Record<ErpStatus, string> = {
  draft: "text-[#9E9E9E]",
  moderation: "text-amber-600",
  publish: "text-green-700",
  inactive: "text-red-600",
};

function StatusText({ status }: { status: string }) {
  const s = (status in STATUS_LABEL ? status : "publish") as ErpStatus;
  return <span className={`text-[13px] ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>;
}

/* ── Intertop-style chip filter dropdown ─────────────────────────────────── */

type ChipOption = { value: string; label: string; count?: number };

/**
 * A filter chip with a checkbox/radio dropdown (Intertop marketplace style).
 * `multi` → checkbox multi-select (selected: string[]); otherwise single-select
 * shown as a clearable chip ("Чернетка ✕").
 */
function FilterChip({
  label, options, selected, onChange, multi = false,
}: {
  label: string;
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = selected.length > 0;
  // Chip label: single → selected option label; multi → "Label (N)".
  const selLabel = !multi && active
    ? options.find((o) => o.value === selected[0])?.label ?? label
    : null;

  function toggle(value: string) {
    if (multi) {
      onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    } else {
      onChange(selected[0] === value ? [] : [value]);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-1.5 border px-3 text-[13px] transition-colors ${
          active
            ? "border-[#007B6E] bg-[#007B6E]/[0.06] text-[#007B6E]"
            : "border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E]"
        }`}>
        <span>{selLabel ?? label}</span>
        {multi && active && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#007B6E] px-1 text-[10px] font-semibold text-white">{selected.length}</span>
        )}
        {!multi && active ? (
          <span onClick={(e) => { e.stopPropagation(); onChange([]); }} className="ml-0.5 text-[#007B6E] hover:text-[#006B5E]">✕</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 max-h-[320px] w-[260px] overflow-y-auto border border-[#E0E0E0] bg-white py-1 shadow-lg">
          {options.length === 0 && <p className="px-3 py-3 text-[12px] text-[#9E9E9E]">Немає значень</p>}
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button key={o.value} onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[#FAFAFA]">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${on ? "border-[#007B6E] bg-[#007B6E]" : "border-[#BDBDBD] bg-white"} ${multi ? "" : "rounded-full"}`}>
                  {on && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="h-3 w-3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span className={`flex-1 truncate ${on ? "text-[#007B6E]" : "text-[#424242]"}`}>{o.label}</span>
                {o.count != null && <span className="text-[11px] text-[#BDBDBD]">{o.count.toLocaleString("uk-UA")}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── root ───────────────────────────────────────────────────────────────── */

type ErpSection = "overview" | "products" | "grid" | "import" | "receiving" | "stocktake" | "suppliers" | "channels" | "purchasing" | "replenishment" | "returns" | "reports" | "price-rules" | "size-charts" | "email-templates" | "categories" | "stock-alerts";

const ICONS: Record<ErpSection, string> = {
  overview:       "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10",
  products:       "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  grid:           "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  import:         "M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  stocktake:      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l1.5 1.5L15 11",
  receiving:      "M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-3l-2 3H9l-2-3H4",
  suppliers:      "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1a4 4 0 100-8 4 4 0 000 8z",
  channels:       "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4-4 4M12 2v13",
  purchasing:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  replenishment:  "M3 3v18h18M7 14l4-4 3 3 5-6",
  returns:        "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",
  reports:        "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  "price-rules":  "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z",
  "size-charts":  "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7",
  "email-templates": "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  categories:     "M4 6h16M4 10h16M4 14h16M4 18h16",
  "stock-alerts": "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
};

const NAV: { title?: string; items: { id: ErpSection; label: string }[] }[] = [
  { items: [{ id: "overview", label: "Огляд" }, { id: "reports", label: "Звіти" }] },
  { title: "Каталог",    items: [{ id: "products", label: "Товари" }, { id: "grid", label: "Таблиця" }, { id: "import", label: "Завантажити файл" }, { id: "stocktake", label: "Інвентаризація" }, { id: "categories", label: "Категорії" }] },
  { title: "Закупівлі", items: [{ id: "replenishment", label: "Поповнення" }, { id: "purchasing", label: "Замовлення" }, { id: "receiving", label: "Прихід" }, { id: "suppliers", label: "Постачальники" }] },
  { title: "Продажі",   items: [{ id: "channels", label: "Канали / Вигрузки" }, { id: "returns", label: "Повернення" }] },
  { title: "Налаштування", items: [{ id: "price-rules", label: "Правила цін" }, { id: "size-charts", label: "Таблиці розмірів" }, { id: "email-templates", label: "Шаблони листів" }, { id: "stock-alerts", label: "Алерти залишків" }] },
  { title: "Інструменти", items: [] }, // spacer
];

export function ErpWorkspace() {
  const [section, setSection] = useState<ErpSection>(() => {
    if (typeof window !== "undefined") {
      const s = new URLSearchParams(window.location.search).get("section") as ErpSection | null;
      const valid: ErpSection[] = ["overview", "products", "grid", "import", "receiving", "stocktake", "suppliers", "channels", "purchasing", "replenishment", "returns", "reports", "price-rules", "size-charts", "email-templates", "categories", "stock-alerts"];
      if (s && valid.includes(s)) return s;
    }
    return "overview";
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const go = (s: ErpSection) => {
    if (s === "import") { setImportOpen(true); setSection("products"); return; }
    setSection(s); setSelected(null); setCreating(false); setImportOpen(false);
  };

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#EEEEEE] bg-white">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#EEEEEE] px-5">
          <span className="text-[14px] font-semibold tracking-[0.16em] text-[#212121]">MANIA</span>
          <span className="rounded-[3px] bg-[#007B6E] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-white">ERP</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-1.5">
              {group.title && (
                <p className="px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#BDBDBD]">{group.title}</p>
              )}
              {group.items.map((it) => {
                const active = section === it.id && !importOpen || (it.id === "import" && importOpen);
                return (
                  <button key={it.id} onClick={() => go(it.id)}
                    className={`flex w-full items-center gap-3 border-l-[3px] px-5 py-2 text-[13px] transition-colors ${
                      active ? "border-[#007B6E] bg-[#007B6E]/[0.07] font-medium text-[#007B6E]" : "border-transparent text-[#616161] hover:bg-[#FAFAFA] hover:text-[#007B6E]"
                    }`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0">
                      <path d={ICONS[it.id]} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {it.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[#EEEEEE] p-3 text-[11px]">
          <Link href="/erp/scan" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[#616161] transition-colors hover:bg-[#FAFAFA] hover:text-[#007B6E]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M3 5h2M3 9h2M3 13h2M3 17h2M7 3v18M17 3v18M21 5h-2M21 9h-2M21 13h-2M21 17h-2" strokeLinecap="round" /></svg>
            Сканер
          </Link>
          <Link href="/admin" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[#616161] transition-colors hover:bg-[#FAFAFA] hover:text-[#007B6E]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M10 19l-7-7 7-7M3 12h18" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Адмінка
          </Link>
          <Link href="/" className="flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[#616161] transition-colors hover:bg-[#FAFAFA] hover:text-[#007B6E]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            На сайт
          </Link>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ErpTopbar onSearch={(query) => { setSearchQuery(query); setSection("products"); setImportOpen(false); }} />
        <main className={`flex-1 ${section === "grid" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
          {section === "overview" && <ErpOverview onGoto={go} />}
          {section === "grid" && <ErpGrid />}
          {section === "products" && (
            creating
              ? <ErpProductCreate onDone={(id) => { setCreating(false); if (id) setSelected(id); }} onCancel={() => setCreating(false)} />
              : selected
                ? <ProductCard id={selected} onBack={() => setSelected(null)} />
                : <ProductList key={searchQuery} initialQuery={searchQuery} onOpen={setSelected} onAddNew={() => setCreating(true)} onUpload={() => setImportOpen(true)} />
          )}
          {section === "replenishment" && <ErpReplenishment onCreated={() => go("purchasing")} />}
          {section === "purchasing" && <ErpPurchasing />}
          {section === "receiving" && <ErpReceiving />}
          {section === "stocktake" && <ErpStocktake />}
          {section === "suppliers" && <ErpSuppliers />}
          {section === "channels" && <ErpChannels />}
          {section === "returns" && <ErpReturns />}
          {section === "reports" && <ErpReports />}
          {section === "price-rules" && <ErpPriceRules />}
          {section === "size-charts" && <ErpSizeCharts />}
          {section === "email-templates" && <ErpEmailTemplates />}
          {section === "categories" && <ErpCategories />}
          {section === "stock-alerts" && <StockAlerts />}
        </main>
      </div>

      {/* ── Import modal (Intertop style) ── */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto" onClick={() => setImportOpen(false)}>
          <div className="relative m-8 w-full max-w-[640px] rounded-[6px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setImportOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#9E9E9E] hover:bg-[#F5F5F5] hover:text-[#212121] text-[18px]">
              ✕
            </button>
            <ErpImportTabs onClose={() => setImportOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Top-bar ── */

function ErpTopbar({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[#E0E0E0] bg-white px-6">
      <form
        onSubmit={(e) => { e.preventDefault(); onSearch(q.trim()); }}
        className="relative w-full max-w-md">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BDBDBD]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Пошук по товарах, артикулу, бренду…"
          className="h-9 w-full rounded-[4px] border border-[#E0E0E0] bg-[#FAFAFA] pl-9 pr-3 text-[13px] text-[#212121] placeholder:text-[#BDBDBD] focus:border-[#007B6E] focus:bg-white focus:outline-none" />
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <button title="Сповіщення" className="relative flex h-9 w-9 items-center justify-center rounded-[4px] text-[#616161] transition-colors hover:bg-[#FAFAFA] hover:text-[#007B6E]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#007B6E]" />
        </button>
        <button title="Довідка" className="flex h-9 w-9 items-center justify-center rounded-[4px] text-[#616161] transition-colors hover:bg-[#FAFAFA] hover:text-[#007B6E]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 16.5h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="mx-1 h-6 w-px bg-[#E0E0E0]" />
        <button className="flex items-center gap-2 rounded-[4px] py-1 pl-1 pr-2 transition-colors hover:bg-[#FAFAFA]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#007B6E] text-[11px] font-semibold text-white">MG</span>
          <span className="text-[12px] font-medium text-[#212121]">Адміністратор</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-[#BDBDBD]"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </header>
  );
}

/* ── product list ───────────────────────────────────────────────────────── */

function ProductList({ onOpen, onAddNew, onUpload, initialQuery }: { onOpen: (id: string) => void; onAddNew: () => void; onUpload: () => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [stock, setStock] = useState<"" | "in" | "out">("");
  const [status, setStatus] = useState<"" | ErpStatus>("");
  // Intertop-style chip filters
  const [fCategories, setFCategories] = useState<string[]>([]);
  const [fBrands, setFBrands] = useState<string[]>([]);
  const [fGender, setFGender] = useState("");
  const [fSeason, setFSeason] = useState("");
  const [facets, setFacets] = useState<{ brands: string[]; categories: { name: string; count?: number }[]; seasons: string[] }>({ brands: [], categories: [], seasons: [] });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [perPage, setPerPage] = useState(100);
  const [showFilters, setShowFilters] = useState(true);
  const [showExtra, setShowExtra] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ type: "price_delta", value: "0", brand: "", category: "" });
  const [bulkMsg, setBulkMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (q.trim()) sp.set("q", q.trim());
    if (stock) sp.set("stock", stock);
    if (status) sp.set("status", status);
    if (fCategories.length) sp.set("category", fCategories.join(","));
    if (fBrands.length) sp.set("brand", fBrands.join(","));
    if (fGender) sp.set("gender", fGender);
    if (fSeason) sp.set("season", fSeason);
    fetch(`/api/erp/products?${sp}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.products ?? []); setTotal(d.total ?? 0);
        setOverview(d.overview ?? null); setStatusCounts(d.statusCounts ?? {});
      })
      .finally(() => setLoading(false));
  }, [q, stock, status, fCategories, fBrands, fGender, fSeason, page, perPage]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSel(new Set()); }, [rows]);
  // Load filter facets once.
  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json())
      .then((d) => setFacets({ brands: d.brands ?? [], categories: d.categories ?? [], seasons: d.seasons ?? [] }))
      .catch(() => {});
  }, []);
  // Reset to page 1 whenever any chip filter changes.
  useEffect(() => { setPage(1); }, [fCategories, fBrands, fGender, fSeason]);

  const activeFilterCount = fCategories.length + fBrands.length + (fGender ? 1 : 0) + (fSeason ? 1 : 0) + (stock ? 1 : 0) + (status ? 1 : 0);
  function clearFilters() {
    setFCategories([]); setFBrands([]); setFGender(""); setFSeason(""); setStock(""); setStatus(""); setPage(1);
  }

  const totalPages = Math.ceil(total / perPage);

  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  function toggleAll() { setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id))); }
  function toggleOne(id: string) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function bulk(target: ErpStatus) {
    if (!sel.size || bulkBusy) return;
    setBulkBusy(true);
    await fetch("/api/erp/products", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...sel], status: target }),
    });
    setBulkBusy(false); setSel(new Set()); load();
  }
  async function applyBulkEdit() {
    if (!sel.size) return;
    setBulkBusy(true); setBulkMsg("");
    const ids = [...sel];
    let body: Record<string, unknown> = { ids };
    if (bulkForm.type === "price_delta") body.price_delta_pct = Number(bulkForm.value);
    else if (bulkForm.type === "sale_pct") body.sale_pct = Number(bulkForm.value);
    else if (bulkForm.type === "brand") body.brand = bulkForm.brand;
    else if (bulkForm.type === "category") body.category = bulkForm.category;
    const r = await fetch("/api/erp/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setBulkMsg(`✓ Оновлено ${d.updated ?? 0} товарів`);
    setBulkBusy(false); load();
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-normal text-[#212121]">Список товарів</h1>
          <p className="mt-0.5 text-[13px] text-[#9E9E9E]">Вибрано продуктів {total.toLocaleString("uk-UA")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary actions */}
          <button onClick={onAddNew}
            className="flex h-9 items-center gap-1.5 bg-[#007B6E] px-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-white hover:bg-[#006B5E] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            Створити товар
          </button>
          <button onClick={onUpload}
            className="flex h-9 items-center gap-1.5 bg-[#007B6E] px-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-white hover:bg-[#006B5E] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Завантажити товари ↑
          </button>
          {/* Bulk status actions */}
          {([
            { label: "Деактивувати ↓", status: "inactive" as ErpStatus },
            { label: "На модерацію ↑", status: "moderation" as ErpStatus },
            { label: "В чернетку ↓",  status: "draft" as ErpStatus },
          ]).map((b) => (
            <button key={b.status} disabled={!sel.size || bulkBusy} onClick={() => bulk(b.status)}
              className="flex h-9 items-center px-4 text-[12px] font-semibold uppercase tracking-[0.06em] border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-30 disabled:pointer-events-none transition-colors">
              {b.label}
            </button>
          ))}
          {/* Bulk edit */}
          <button onClick={() => setBulkEditOpen(true)} disabled={!sel.size}
            className="flex h-9 items-center gap-1.5 border border-[#E0E0E0] bg-white px-3 text-[12px] font-semibold uppercase text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-30 transition-colors">
            ✎ Редагувати обрані
          </button>
          {/* Icon buttons */}
          <span className="mx-1 h-6 w-px bg-[#E0E0E0]" />
          <button onClick={() => setShowExtra((v) => !v)} title="Колонки"
            className={`flex h-9 w-9 items-center justify-center border transition-colors ${showExtra ? "border-[#007B6E] text-[#007B6E]" : "border-[#E0E0E0] text-[#9E9E9E] hover:border-[#007B6E] hover:text-[#007B6E]"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>

      {/* Intertop-style filter bar: ФІЛЬТРИ button + chip dropdowns + clear */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowFilters((v) => !v)}
          className="flex h-9 items-center gap-2 bg-[#212121] px-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-white hover:bg-[#000] transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 4h18M6 8h12M10 12h4M11 16h2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Фільтри
          {activeFilterCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#007B6E] px-1 text-[10px]">{activeFilterCount}</span>}
        </button>

        {showFilters && (
          <>
            <FilterChip label="Категорія" multi
              options={facets.categories.map((c) => ({ value: c.name, label: c.name, count: c.count }))}
              selected={fCategories} onChange={setFCategories} />
            <FilterChip label="Бренд" multi
              options={facets.brands.map((b) => ({ value: b, label: b }))}
              selected={fBrands} onChange={setFBrands} />
            <FilterChip label="Статус"
              options={(["publish", "moderation", "draft", "inactive"] as ErpStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s], count: statusCounts[s] }))}
              selected={status ? [status] : []} onChange={(n) => setStatus((n[0] as ErpStatus) ?? "")} />
            <FilterChip label="Наявність"
              options={[{ value: "in", label: "В наявності", count: overview ? Number(overview.in_stock) : undefined }, { value: "out", label: "Немає", count: overview ? Number(overview.out_stock) : undefined }]}
              selected={stock ? [stock] : []} onChange={(n) => setStock((n[0] as "in" | "out") ?? "")} />
            <FilterChip label="Стать"
              options={[{ value: "women", label: "Жіноче" }, { value: "men", label: "Чоловіче" }, { value: "unisex", label: "Унісекс" }]}
              selected={fGender ? [fGender] : []} onChange={(n) => setFGender(n[0] ?? "")} />
            {facets.seasons.length > 0 && (
              <FilterChip label="Сезон"
                options={facets.seasons.map((s) => ({ value: s, label: s }))}
                selected={fSeason ? [fSeason] : []} onChange={(n) => setFSeason(n[0] ?? "")} />
            )}
            {activeFilterCount > 0 && (
              <button onClick={clearFilters}
                className="ml-1 text-[13px] text-[#007B6E] underline-offset-2 hover:underline">
                Очистити фільтри
              </button>
            )}
          </>
        )}

        <div className="relative ml-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#BDBDBD]"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Пошук товарів…"
            className="h-9 w-64 border border-[#E0E0E0] bg-white pl-8 pr-3 text-[13px] focus:border-[#007B6E] focus:outline-none" />
        </div>
      </div>

      {/* Active filter chips summary (selected categories/brands as removable tags) */}
      {(fCategories.length > 0 || fBrands.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {fCategories.map((c) => (
            <span key={"c" + c} className="flex items-center gap-1 border border-[#007B6E]/30 bg-[#007B6E]/[0.06] px-2 py-1 text-[12px] text-[#007B6E]">
              {c}<button onClick={() => setFCategories((p) => p.filter((x) => x !== c))} className="hover:text-[#006B5E]">✕</button>
            </span>
          ))}
          {fBrands.map((b) => (
            <span key={"b" + b} className="flex items-center gap-1 border border-[#007B6E]/30 bg-[#007B6E]/[0.06] px-2 py-1 text-[12px] text-[#007B6E]">
              {b}<button onClick={() => setFBrands((p) => p.filter((x) => x !== b))} className="hover:text-[#006B5E]">✕</button>
            </span>
          ))}
        </div>
      )}

      {/* Selection indicator */}
      {sel.size > 0 && (
        <div className="mb-3 flex items-center gap-2 border border-[#007B6E]/20 bg-[#007B6E]/[0.05] px-3 py-2 text-[13px]">
          <span className="font-semibold text-[#007B6E]">Вибрано: {sel.size}</span>
          <span className="text-[#616161]">— застосуйте дію з панелі вгорі</span>
          <button onClick={() => setSel(new Set())} className="ml-auto text-[12px] uppercase tracking-[0.06em] text-[#9E9E9E] hover:text-[#007B6E]">Зняти</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[1500px] text-[13px]">
          <thead>
            <tr className="border-b border-[#E0E0E0] bg-white text-[12px] text-[#9E9E9E]">
              <th className="w-10 px-3 py-3 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#007B6E]" />
              </th>
              <th className="px-3 py-3 text-left font-normal">ID товару</th>
              <th className="px-3 py-3 text-left font-normal">Назва</th>
              <th className="px-3 py-3 text-left font-normal">Зображення</th>
              <th className="px-3 py-3 text-left font-normal">Категорія</th>
              <th className="px-3 py-3 text-left font-normal">Код товару</th>
              <th className="px-3 py-3 text-left font-normal">Заводський артикул</th>
              <th className="px-3 py-3 text-left font-normal">Артикул</th>
              <th className="px-3 py-3 text-left font-normal">Статус</th>
              <th className="px-3 py-3 text-center font-normal">Публікувався</th>
              <th className="px-3 py-3 text-left font-normal">Востаннє змінений</th>
              <th className="px-3 py-3 text-left font-normal">Створений</th>
              <th className="px-3 py-3 text-left font-normal">Колір</th>
              <th className="px-3 py-3 text-left font-normal">Бренд</th>
              <th className="px-3 py-3 text-left font-normal">Сезон</th>
              {showExtra && <th className="px-3 py-3 text-center font-normal">Склад</th>}
              {showExtra && <th className="px-3 py-3 text-right font-normal">Ціна</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {loading && !rows.length && <tr><td colSpan={showExtra ? 17 : 15} className="py-14 text-center text-[13px] text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={showExtra ? 17 : 15} className="py-14 text-center text-[13px] text-[#9E9E9E]">Нічого не знайдено</td></tr>}
            {rows.map((r) => {
              const checked = sel.has(r.id);
              const published = r.status === "publish";
              return (
              <tr key={r.id} onClick={() => onOpen(r.id)} className={`cursor-pointer hover:bg-[#FAFAFA] ${checked ? "bg-[#E8F5F3]" : ""}`}>
                <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} onChange={() => toggleOne(r.id)} className="h-3.5 w-3.5 accent-[#007B6E]" />
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#9E9E9E]">{r.id}</td>
                <td className="px-3 py-2.5"><span className="block max-w-[260px] truncate text-[#007B6E] hover:underline">{r.name}</span></td>
                <td className="px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.image_src
                    ? <img src={r.image_src} alt="" className="h-9 w-9 shrink-0 border border-[#EEEEEE] object-cover" />
                    : <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#EEEEEE] bg-[#F5F5F5] text-[#BDBDBD]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16v12H4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>}
                </td>
                <td className="px-3 py-2.5 text-[#424242]">{r.category || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#9E9E9E]">mp{r.id}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#9E9E9E]">{r.factory_article || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#9E9E9E]">{r.sku || "—"}</td>
                <td className="px-3 py-2.5"><StatusText status={r.status} /></td>
                <td className="px-3 py-2.5 text-center">
                  {published
                    ? <span className="text-[13px] text-green-700">Так</span>
                    : <span className="text-[13px] text-[#BDBDBD]">Ні</span>}
                </td>
                <td className="px-3 py-2.5 text-[#9E9E9E] tabular-nums">{dmy(r.updated_at)}</td>
                <td className="px-3 py-2.5 text-[#9E9E9E] tabular-nums">{dmy(r.created_at)}</td>
                <td className="px-3 py-2.5 text-[#424242]">{r.color || "—"}</td>
                <td className="px-3 py-2.5 text-[#424242]">{r.brand}</td>
                <td className="px-3 py-2.5 text-[#424242]">{r.season || "—"}</td>
                {showExtra && (
                  <td className="px-3 py-2.5 text-center">
                    {r.is_in_stock
                      ? <span className="inline-flex items-center gap-1.5 text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />{r.stock_qty > 0 ? r.stock_qty : "є"}</span>
                      : <span className="inline-flex items-center gap-1.5 text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />0</span>}
                  </td>
                )}
                {showExtra && <td className="px-3 py-2.5 text-right tabular-nums text-[#212121]">{uah(r.price)}</td>}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#9E9E9E]">
        <div className="flex items-center gap-2">
          <span>Показувати</span>
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-8 border border-[#E0E0E0] bg-white px-2 text-[13px] text-[#212121] focus:border-[#007B6E] focus:outline-none">
            {[50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>
            {total === 0 ? "0" : `${((page - 1) * perPage + 1).toLocaleString("uk-UA")}–${Math.min(page * perPage, total).toLocaleString("uk-UA")}`} / {total.toLocaleString("uk-UA")}
          </span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-8 w-8 items-center justify-center border border-[#E0E0E0] bg-white disabled:opacity-30 hover:border-[#007B6E]">‹</button>
            {pageList(page, totalPages).map((p, i) =>
              p === "…"
                ? <span key={`e${i}`} className="px-1 text-[#BDBDBD]">…</span>
                : <button key={p} onClick={() => setPage(p)}
                    className={`flex h-8 min-w-8 items-center justify-center border px-1.5 tabular-nums ${
                      p === page ? "border-[#007B6E] bg-[#007B6E] text-white" : "border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E]"
                    }`}>{p}</button>
            )}
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="flex h-8 w-8 items-center justify-center border border-[#E0E0E0] bg-white disabled:opacity-30 hover:border-[#007B6E]">›</button>
          </div>
        )}
      </div>

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setBulkEditOpen(false); setBulkMsg(""); }}>
          <div className="w-full max-w-[420px] border border-[#E0E0E0] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-medium text-[#212121]">Редагувати {sel.size} товарів</h3>
              <button onClick={() => { setBulkEditOpen(false); setBulkMsg(""); }} className="text-[#9E9E9E] hover:text-[#212121]">✕</button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Дія</span>
                <select value={bulkForm.type} onChange={(e) => setBulkForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none">
                  <option value="price_delta">Змінити ціну на ±%</option>
                  <option value="sale_pct">Встановити акцію N%</option>
                  <option value="brand">Змінити бренд</option>
                  <option value="category">Змінити категорію</option>
                </select>
              </label>
              {(bulkForm.type === "price_delta" || bulkForm.type === "sale_pct") && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">
                    {bulkForm.type === "price_delta" ? "% зміни (наприклад +10 або -5)" : "Знижка %"}
                  </span>
                  <input type="number" value={bulkForm.value} onChange={(e) => setBulkForm((f) => ({ ...f, value: e.target.value }))}
                    className="w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none" />
                </label>
              )}
              {bulkForm.type === "brand" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Новий бренд</span>
                  <input value={bulkForm.brand} onChange={(e) => setBulkForm((f) => ({ ...f, brand: e.target.value }))}
                    className="w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none" />
                </label>
              )}
              {bulkForm.type === "category" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Нова категорія</span>
                  <input value={bulkForm.category} onChange={(e) => setBulkForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none" />
                </label>
              )}
            </div>
            {bulkMsg && <p className="mt-3 text-[12px] text-green-700">{bulkMsg}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setBulkEditOpen(false); setBulkMsg(""); }}
                className="h-9 border border-[#E0E0E0] bg-white px-4 text-[12px] font-semibold uppercase text-[#424242] hover:border-[#007B6E] transition-colors">
                Скасувати
              </button>
              <button onClick={applyBulkEdit} disabled={bulkBusy}
                className="h-9 bg-[#007B6E] px-4 text-[12px] font-semibold uppercase text-white hover:bg-[#006B5E] disabled:opacity-40 transition-colors">
                {bulkBusy ? "Застосування…" : "Застосувати"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── product card ───────────────────────────────────────────────────────── */

const fieldLbl = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#9E9E9E]";
const fieldInp = "h-9 w-full border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";
const cardCls = "border border-[#E0E0E0] bg-white p-4";
const cardTitleCls = "mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9E9E9E]";

const TEXT_FIELDS: { k: keyof ProductForm; label: string; list?: string; placeholder?: string }[] = [
  { k: "brand", label: "Бренд", list: "erp-brands" },
  { k: "category", label: "Категорія", list: "erp-cats" },
  { k: "color", label: "Колір", list: "erp-colors" },
  { k: "season", label: "Сезон", list: "erp-seasons" },
  { k: "country", label: "Країна" },
  { k: "collection", label: "Колекція" },
  { k: "composition", label: "Склад тканини", placeholder: "напр. Бавовна 95%, Еластан 5%" },
  { k: "sku", label: "Код товару (SKU)" },
  { k: "factory_article", label: "Заводський артикул" },
];

type ProductForm = {
  name: string; description: string; brand: string; category: string; gender: string;
  color: string; composition: string; season: string; country: string; collection: string;
  sku: string; factory_article: string;
  regular_price: string; sale_price: string; cost_price: string;
  meta_title: string; meta_description: string;
};

function formFromProduct(p: ProductDetail): ProductForm {
  return {
    name: p.name ?? "", description: p.description ?? "", brand: p.brand ?? "",
    category: p.category ?? "", gender: p.gender ?? "", color: p.color ?? "",
    composition: p.composition ?? "", season: p.season ?? "", country: p.country ?? "",
    collection: p.collection ?? "", sku: p.sku ?? "", factory_article: p.factory_article ?? "",
    regular_price: p.regular_price ?? "", sale_price: p.sale_price ?? "", cost_price: p.cost_price ?? "",
    meta_title: p.meta_title ?? "", meta_description: p.meta_description ?? "",
  };
}

function ProductCard({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"product" | "offers">("product");
  const [newSize, setNewSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [facets, setFacets] = useState<Facets>({ brands: [], categories: [], colors: [], seasons: [] });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const [form, setForm] = useState<ProductForm | null>(null);
  const [orig, setOrig] = useState<ProductForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState<"" | "fill" | "desc">("");
  const [aiErr, setAiErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/product/${id}`).then((r) => r.json()).then((d: Detail) => {
      setData(d);
      if (d.product) { const f = formFromProduct(d.product); setForm(f); setOrig(f); }
    }).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json())
      .then((d) => setFacets({ brands: d.brands ?? [], categories: d.categories ?? [], colors: d.colors ?? [], seasons: d.seasons ?? [] }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch(`/api/erp/product/${id}/photos`).then((r) => r.json())
      .then((d) => setPhotos(d.photos ?? [])).catch(() => {});
  }, [id]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch(`/api/erp/product/${id}/photos`, { method: "POST", body: fd });
    const d = await r.json();
    if (d.images) setPhotos(d.images);
    setUploading(false);
  }
  async function deletePhoto(url: string) {
    await fetch(`/api/erp/product/${id}/photos`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setPhotos((p) => p.filter((u) => u !== url));
  }
  async function reorderPhotos(newOrder: string[]) {
    setPhotos(newOrder);
    await fetch(`/api/erp/product/${id}/photos`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: newOrder }),
    });
  }
  async function duplicateProduct() {
    setDuplicating(true);
    const r = await fetch("/api/erp/products/duplicate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: Number(id) }),
    });
    const d = await r.json();
    setDuplicating(false);
    if (d.ok) alert(`✓ Створено копію товару #${d.newId}. Відкрийте його зі списку.`);
  }

  async function variantPut(body: Record<string, unknown>) {
    setBusy(true);
    await fetch("/api/erp/variants", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    load();
  }
  async function addSize() {
    if (!newSize.trim()) return;
    setBusy(true);
    await fetch("/api/erp/variants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: Number(id), size: newSize.trim() }) });
    setNewSize(""); setBusy(false); load();
  }
  async function delSize(vid: number) {
    if (!confirm("Видалити розмір?")) return;
    await fetch(`/api/erp/variants?id=${vid}`, { method: "DELETE" });
    load();
  }
  async function setStatus(status: ErpStatus) {
    if (!data) return;
    setData({ ...data, product: { ...data.product, status } });
    await fetch(`/api/erp/product/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  function buildPatch(): Record<string, unknown> | null {
    if (!form || !orig) return null;
    const patch: Record<string, unknown> = {};
    (["name", "description", "brand", "category", "gender", "color", "composition", "season", "country", "collection", "sku", "factory_article", "meta_title", "meta_description"] as (keyof ProductForm)[])
      .forEach((k) => { if (form[k].trim() !== orig[k].trim()) patch[k] = form[k].trim(); });
    const numChanged = (k: keyof ProductForm) => Number(form[k] || 0) !== Number(orig[k] || 0);
    if (numChanged("regular_price")) patch.regular_price = Number(form.regular_price) || 0;
    if (numChanged("sale_price")) patch.sale_price = Number(form.sale_price) > 0 ? Number(form.sale_price) : null;
    if (numChanged("cost_price")) patch.cost_price = Number(form.cost_price) > 0 ? Number(form.cost_price) : null;
    return Object.keys(patch).length ? patch : null;
  }
  const dirty = !!buildPatch();
  async function saveProduct() {
    const patch = buildPatch();
    if (!patch || !form) return;
    if (!form.name.trim()) { setErr("Вкажіть назву"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch(`/api/erp/product/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await r.json();
      if (r.ok) { setOrig(form); setSaved(true); setTimeout(() => setSaved(false), 1800); load(); }
      else setErr(d.error ?? "Помилка збереження");
    } catch { setErr("Помилка мережі"); }
    setSaving(false);
  }

  async function magicFill() {
    if (!form?.name.trim()) { setAiErr("Назва порожня"); return; }
    setAi("fill"); setAiErr("");
    try {
      const f = await aiAutofill({ name: form.name, brand: form.brand, category: form.category, color: form.color, season: form.season, composition: form.composition, gender: form.gender });
      setForm((cur) => {
        if (!cur) return cur;
        const next = { ...cur };
        (["category", "gender", "color", "season", "composition", "brand"] as (keyof ProductForm)[])
          .forEach((k) => { if (f[k] && !cur[k].trim()) next[k] = f[k]; });
        if (f.description && !cur.description.trim()) next.description = f.description;
        return next;
      });
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }
  async function genDesc() {
    if (!form?.name.trim()) { setAiErr("Назва порожня"); return; }
    setAi("desc"); setAiErr("");
    try {
      const t = await aiDescription({ name: form.name, brand: form.brand, category: form.category, color: form.color, season: form.season, composition: form.composition });
      if (t) setForm((cur) => (cur ? { ...cur, description: t } : cur));
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }

  if (loading && !data) return <div className="p-8 text-center text-[13px] text-[#9E9E9E]">Завантаження…</div>;
  if (!data || !form) return <div className="p-8 text-center text-[13px] text-[#9E9E9E]">Товар не знайдено</div>;

  const { product, variants, movements } = data;
  const totalUnits = variants.reduce((s, v) => s + v.stock_qty, 0);
  const activeOffers = variants.filter((v) => v.active).length;
  const status = (product.status in STATUS_LABEL ? product.status : "publish") as ErpStatus;
  const published = status === "publish";
  const images: string[] = Array.isArray(product.images)
    ? product.images.map((x) => (typeof x === "string" ? x : x?.src ?? "")).filter(Boolean)
    : [];
  const effPrice = Number(form.sale_price) > 0 ? Number(form.sale_price) : Number(form.regular_price);
  const margin = effPrice > 0 && Number(form.cost_price) > 0 ? Math.round(((effPrice - Number(form.cost_price)) / effPrice) * 100) : null;
  const set = (k: keyof ProductForm, v: string) => setForm((f) => f ? { ...f, [k]: v } : f);

  return (
    <div className="mx-auto max-w-[1200px] p-5">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onBack} className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#9E9E9E] hover:text-[#007B6E]">‹ До списку</button>
        <button onClick={duplicateProduct} disabled={duplicating}
          className="h-8 border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-40 transition-colors">
          {duplicating ? "Копіювання…" : "⎘ Дублювати"}
        </button>
      </div>

      {/* header */}
      <div className="flex flex-wrap items-start gap-4 border border-[#E0E0E0] bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {product.image_src
          ? <img src={product.image_src} alt="" className="h-16 w-16 shrink-0 border border-[#EEEEEE] object-cover" />
          : <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-[#F5F5F5] text-[10px] text-[#BDBDBD]">нема фото</span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] text-[#212121]">{product.name}</h1>
          <p className="text-[13px] text-[#9E9E9E]">ID {product.id} · {product.brand || "—"} · {product.category || "—"}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <span className="text-[#9E9E9E]">Ціна <b className="text-[#212121] tabular-nums">{uah(Number(product.price))}</b></span>
            <span className="text-[#9E9E9E]">Залишок <b className="text-[#212121] tabular-nums">{totalUnits}</b></span>
            <span className="text-[#9E9E9E]">Розмірів <b className="text-[#212121] tabular-nums">{variants.length}</b></span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#9E9E9E]">Публікувався: {published ? <b className="text-green-700">Так</b> : <span className="text-[#BDBDBD]">Ні</span>}</span>
            <StatusText status={status} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as ErpStatus)}
            className="h-8 border border-[#E0E0E0] bg-white px-2 text-[13px] text-[#212121] focus:border-[#007B6E] focus:outline-none">
            {(["publish", "moderation", "draft", "inactive"] as ErpStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* AI assist bar */}
      <div className="mt-2 flex items-center gap-2">
        <button onClick={magicFill} disabled={!!ai}
          className="flex h-8 items-center gap-1.5 border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-40 transition-colors">
          {ai === "fill" ? "ШІ заповнює…" : "✦ ШІ: заповнити поля"}
        </button>
        <button onClick={genDesc} disabled={!!ai}
          className="flex h-8 items-center gap-1.5 border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-40 transition-colors">
          {ai === "desc" ? "Генерація…" : "✦ ШІ: опис"}
        </button>
        {aiErr && <span className="text-[12px] text-red-600">{aiErr}</span>}
      </div>

      {/* tabs */}
      <div className="mt-4 flex items-center gap-0 border-b border-[#E0E0E0]">
        {([["product", "Товар"], ["offers", `Торгові пропозиції (${variants.length})`]] as const).map(([t, lab]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-5 py-2.5 text-[13px] font-medium transition-colors ${
              tab === t ? "border-[#007B6E] text-[#007B6E]" : "border-transparent text-[#9E9E9E] hover:text-[#007B6E]"
            }`}>{lab}</button>
        ))}
      </div>

      {/* ── TAB: Товар ── */}
      {tab === "product" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className={cardCls}>
                <label className="block">
                  <span className={fieldLbl}>Назва товару *</span>
                  <input value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldInp + " h-10 text-[15px]"} />
                </label>
                <label className="mt-3 block">
                  <span className={fieldLbl}>Опис</span>
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4}
                    className="w-full resize-none border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] focus:border-[#007B6E] focus:outline-none" />
                </label>
              </div>

              <div className={cardCls}>
                <p className={cardTitleCls}>Фото товару</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(photos.length ? photos : images).map((src, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-16 w-16 border border-[#E0E0E0] object-cover" />
                      {i > 0 && (
                        <button onClick={() => reorderPhotos([(photos.length ? photos : images).filter((_, idx) => idx !== i)[0] ?? src, ...(photos.length ? photos : images).filter((_, idx) => idx !== 0 && idx !== i)])}
                          title="Зробити головним"
                          className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white text-[10px] font-medium">
                          Головне
                        </button>
                      )}
                      {i === 0 && <span className="absolute top-0 left-0 bg-[#007B6E] text-white text-[9px] px-1">●</span>}
                      <button onClick={() => deletePhoto(src)}
                        className="absolute top-0.5 right-0.5 hidden group-hover:flex h-4 w-4 items-center justify-center bg-red-600 text-white text-[10px] rounded-full">✕</button>
                    </div>
                  ))}
                  <label className={`flex h-16 w-16 cursor-pointer items-center justify-center border-2 border-dashed border-[#E0E0E0] text-[#BDBDBD] hover:border-[#007B6E] hover:text-[#007B6E] transition-colors ${uploading ? "opacity-50" : ""}`}>
                    {uploading ? "…" : "+"}
                    <input type="file" accept="image/*" className="sr-only" disabled={uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
                  </label>
                </div>
                <p className="text-[11px] text-[#9E9E9E]">Перше фото — головне. Наведіть, щоб видалити або змінити порядок.</p>
              </div>

              <div className={cardCls}>
                <p className={cardTitleCls}>Організація</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TEXT_FIELDS.map((f) => (
                    <label key={f.k} className="block">
                      <span className={fieldLbl}>{f.label}</span>
                      <input value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} list={f.list} placeholder={f.placeholder} className={fieldInp} />
                    </label>
                  ))}
                  <label className="block">
                    <span className={fieldLbl}>Стать</span>
                    <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className={fieldInp + " pr-7"}>
                      <option value="">—</option><option value="women">Жіноче</option><option value="men">Чоловіче</option>
                    </select>
                  </label>
                </div>
                <datalist id="erp-brands">{facets.brands.map((b) => <option key={b} value={b} />)}</datalist>
                <datalist id="erp-cats">{facets.categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                <datalist id="erp-colors">{facets.colors.map((c) => <option key={c} value={c} />)}</datalist>
                <datalist id="erp-seasons">{facets.seasons.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            </div>

            <div className="space-y-4">
              <div className={cardCls}>
                <p className={cardTitleCls}>Ціни</p>
                <label className="block"><span className={fieldLbl}>Базова ціна, ₴ *</span>
                  <input value={form.regular_price} onChange={(e) => set("regular_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                <label className="mt-3 block"><span className={fieldLbl}>Акційна ціна, ₴</span>
                  <input value={form.sale_price} onChange={(e) => set("sale_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                <label className="mt-3 block"><span className={fieldLbl}>Закупка (собівартість), ₴</span>
                  <input value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} inputMode="numeric" className={fieldInp} /></label>
                {margin != null && (
                  <p className={`mt-2 text-[13px] ${margin < 0 ? "text-red-600" : "text-green-700"}`}>Маржа: <b>{margin}%</b></p>
                )}
                <p className="mt-2 text-[12px] text-[#9E9E9E]">Створено {dmy(product.created_at)} · змінено {dmy(product.updated_at)}</p>
              </div>

              <div className={cardCls}>
                <p className={cardTitleCls}>SEO</p>
                <label className="block"><span className={fieldLbl}>Meta Title</span>
                  <input value={form.meta_title} onChange={(e) => set("meta_title", e.target.value)}
                    placeholder={form.name} className={fieldInp} maxLength={70} /></label>
                <p className="mt-0.5 text-right text-[10px] text-[#BDBDBD]">{form.meta_title.length}/70</p>
                <label className="mt-3 block"><span className={fieldLbl}>Meta Description</span>
                  <textarea value={form.meta_description} onChange={(e) => set("meta_description", e.target.value)}
                    rows={3} maxLength={160}
                    className="w-full resize-none border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] focus:border-[#007B6E] focus:outline-none" /></label>
                <p className="mt-0.5 text-right text-[10px] text-[#BDBDBD]">{form.meta_description.length}/160</p>
              </div>
            </div>
          </div>

          {/* save bar */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-[#E0E0E0] bg-white px-4 py-3">
            {err && <span className="text-[13px] text-red-600">{err}</span>}
            {saved && <span className="text-[13px] text-green-700">✓ Збережено</span>}
            {dirty && !saved && <span className="text-[12px] text-[#9E9E9E]">Є незбережені зміни</span>}
            <button onClick={saveProduct} disabled={!dirty || saving}
              className="h-9 bg-[#007B6E] px-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#006B5E] disabled:opacity-40 transition-colors">
              {saving ? "Збереження…" : "Зберегти зміни"}
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: Торгові пропозиції ── */}
      {tab === "offers" && (
        <div className="mt-4 space-y-4">
          <div className="border border-[#E0E0E0] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F5F5F5] px-4 py-2.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#9E9E9E]">Торгові пропозиції · активних {activeOffers}/{variants.length} · {totalUnits} од</h2>
              {busy && <span className="text-[11px] text-[#9E9E9E]">збереження…</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#F5F5F5] text-[11px] font-medium uppercase tracking-wider text-[#9E9E9E]">
                    <th className="px-3 py-2.5 text-center">Активн.</th>
                    <th className="px-3 py-2.5 text-left">Розмір</th>
                    <th className="px-3 py-2.5 text-left">Штрихкод</th>
                    <th className="px-3 py-2.5 text-left">Код оффера (mp)</th>
                    <th className="px-3 py-2.5 text-right">Базова ціна</th>
                    <th className="px-3 py-2.5 text-right">Акційна ціна</th>
                    <th className="px-3 py-2.5 text-center">Наявність</th>
                    <th className="px-3 py-2.5 text-left hidden xl:table-cell">Оновлено</th>
                    <th className="px-3 py-2.5 text-center w-24">Швидко</th>
                    <th className="px-3 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5]">
                  {variants.map((v) => (
                    <VariantRow key={v.id} v={v} onPut={variantPut} onDelete={() => delSize(v.id)} />
                  ))}
                  {variants.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-[13px] text-[#9E9E9E]">Пропозицій ще немає</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 border-t border-[#F5F5F5] px-4 py-2.5">
              <input value={newSize} onChange={(e) => setNewSize(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSize()}
                placeholder="Новий розмір (напр. L)" className={inp + " w-44"} />
              <button onClick={addSize} disabled={!newSize.trim()} className="h-9 bg-[#007B6E] px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#006B5E] disabled:opacity-40 transition-colors">Додати</button>
            </div>
          </div>

          {/* movements ledger */}
          <div className="border border-[#E0E0E0] bg-white">
            <div className="border-b border-[#F5F5F5] px-4 py-2.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#9E9E9E]">Рух залишків</h2>
            </div>
            {movements.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[#9E9E9E]">Рухів ще не було</p>
            ) : (
              <ul className="max-h-72 divide-y divide-[#F5F5F5] overflow-y-auto">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <span className="w-24 shrink-0 text-[#9E9E9E]">{dmy(m.created_at)}</span>
                    <span className="w-24 shrink-0 font-medium uppercase text-[#212121]">{MOVE_LABEL[m.type] ?? m.type}</span>
                    <span className="w-12 shrink-0 text-[#9E9E9E]">{m.size}</span>
                    <span className={`w-12 shrink-0 text-right tabular-nums ${m.delta >= 0 ? "text-green-700" : "text-red-600"}`}>{m.delta >= 0 ? "+" : ""}{m.delta}</span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-[#9E9E9E]">→ {m.qty_after}</span>
                    <span className="min-w-0 flex-1 truncate text-[#9E9E9E]">{m.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantRow({ v, onPut, onDelete }: {
  v: Variant; onPut: (b: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [qty, setQty] = useState(String(v.stock_qty));
  const [barcode, setBarcode] = useState(v.barcode);
  const [offer, setOffer] = useState(v.offer_code);
  const [price, setPrice] = useState(v.price != null ? String(v.price) : "");
  const [sale, setSale] = useState(v.sale_price != null ? String(v.sale_price) : "");
  useEffect(() => {
    setQty(String(v.stock_qty)); setBarcode(v.barcode); setOffer(v.offer_code);
    setPrice(v.price != null ? String(v.price) : ""); setSale(v.sale_price != null ? String(v.sale_price) : "");
  }, [v]);
  const cell = "h-8 border border-[#E0E0E0] px-2 text-[12px] focus:border-[#007B6E] focus:outline-none";

  return (
    <tr className={`hover:bg-[#FAFAFA] ${!v.active ? "opacity-50" : ""}`}>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={v.active} onChange={() => onPut({ variantId: v.id, active: !v.active })}
          className="h-3.5 w-3.5 accent-[#007B6E]" title={v.active ? "Активна" : "Вимкнена"} />
      </td>
      <td className="px-3 py-2 font-medium text-[#212121]">{v.size}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)}
            onBlur={() => barcode !== v.barcode && onPut({ variantId: v.id, barcode })}
            placeholder="—" className={cell + " w-28"} />
          {!barcode && (
            <button title="Згенерувати EAN-13"
              onClick={() => {
                const digits = `200${String(v.id).padStart(8, "0")}`;
                const sum = digits.split("").reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
                const check = (10 - (sum % 10)) % 10;
                const ean = digits + check;
                setBarcode(ean);
                onPut({ variantId: v.id, barcode: ean });
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#E0E0E0] text-[#9E9E9E] hover:border-[#007B6E] hover:text-[#007B6E] text-[10px]">
              ▦
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <input value={offer} onChange={(e) => setOffer(e.target.value)}
          onBlur={() => offer !== v.offer_code && onPut({ variantId: v.id, offer_code: offer })}
          placeholder="mp…" className={cell + " w-28 font-mono"} />
      </td>
      <td className="px-3 py-2 text-right">
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          onBlur={() => { const n = price === "" ? null : Number(price); if (n !== v.price) onPut({ variantId: v.id, price: n }); }}
          placeholder="за товаром" className={cell + " w-24 text-right tabular-nums"} />
      </td>
      <td className="px-3 py-2 text-right">
        <input value={sale} onChange={(e) => setSale(e.target.value)}
          onBlur={() => { const n = sale === "" ? null : Number(sale); if (n !== v.sale_price) onPut({ variantId: v.id, sale_price: n }); }}
          placeholder="—" className={cell + " w-24 text-right tabular-nums"} />
      </td>
      <td className="px-3 py-2 text-center">
        <input value={qty} onChange={(e) => setQty(e.target.value)}
          onBlur={() => { const n = Number(qty); if (n !== v.stock_qty) onPut({ variantId: v.id, setQty: n, type: "adjust", note: "Ручне коригування" }); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cell + " w-16 text-center text-[13px] tabular-nums"} />
      </td>
      <td className="px-3 py-2 hidden xl:table-cell">
        <span className="text-[12px] text-[#9E9E9E]" title={v.updated_by || ""}>
          {v.updated_at ? new Date(v.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" }) : "—"}
          {v.updated_by && v.updated_by !== "import" ? <span className="ml-1 text-[#BDBDBD]">· {v.updated_by}</span> : null}
          {v.updated_by === "import" ? <span className="ml-1 text-amber-600">· імпорт</span> : null}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => onPut({ variantId: v.id, delta: 1, type: "receipt", note: "Прихід +1" })} title="Прихід +1"
            className="flex h-7 w-7 items-center justify-center border border-[#E0E0E0] text-green-700 hover:border-green-600">＋</button>
          <button onClick={() => onPut({ variantId: v.id, delta: -1, type: "writeoff", note: "Списання −1" })} title="Списання −1"
            className="flex h-7 w-7 items-center justify-center border border-[#E0E0E0] text-red-600 hover:border-red-500">－</button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={onDelete} className="text-[#BDBDBD] hover:text-red-600" title="Видалити пропозицію">✕</button>
      </td>
    </tr>
  );
}

function StockAlerts() {
  const [threshold, setThreshold] = useState(3);
  const [products, setProducts] = useState<{ id: string; name: string; brand: string; stock_qty: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/erp/stock-alerts");
    const d = await r.json();
    setThreshold(d.threshold ?? 3);
    setProducts(d.products ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveThreshold() {
    setSaving(true);
    await fetch("/api/erp/stock-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_threshold", threshold }),
    });
    setSaving(false); load();
  }
  async function sendAlerts() {
    setSending(true); setMsg("");
    const r = await fetch("/api/erp/stock-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_alerts" }),
    });
    const d = await r.json();
    setMsg(d.sent ? `✓ Відправлено ${d.sent} алертів у Telegram` : "Немає критичних залишків");
    setSending(false);
  }

  return (
    <div className="p-6 max-w-[700px]">
      <h1 className="mb-1 text-[22px] font-normal text-[#212121]">Алерти залишків</h1>
      <p className="mb-5 text-[13px] text-[#9E9E9E]">Товари нижче порогового рівня — сповіщення через Telegram</p>

      <div className="mb-5 flex items-end gap-3 border border-[#E0E0E0] bg-white p-4">
        <label className="block flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Поріг (одиниць)</span>
          <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
            className="h-9 w-32 border border-[#E0E0E0] px-3 text-[13px] focus:border-[#007B6E] focus:outline-none" />
        </label>
        <button onClick={saveThreshold} disabled={saving}
          className="h-9 border border-[#E0E0E0] bg-white px-4 text-[12px] font-semibold uppercase text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E] disabled:opacity-40 transition-colors">
          {saving ? "Збереження…" : "Зберегти поріг"}
        </button>
        <button onClick={sendAlerts} disabled={sending}
          className="h-9 bg-[#007B6E] px-4 text-[12px] font-semibold uppercase text-white hover:bg-[#006B5E] disabled:opacity-40 transition-colors">
          {sending ? "Відправка…" : "📩 Відправити в Telegram"}
        </button>
      </div>
      {msg && <p className="mb-4 text-[13px] text-green-700">{msg}</p>}

      <div className="border border-[#E0E0E0] bg-white">
        <div className="border-b border-[#E0E0E0] px-4 py-3">
          <p className="text-[12px] font-semibold uppercase text-[#9E9E9E]">
            Товари з залишком ≤ {threshold} од. ({products.length})
          </p>
        </div>
        {loading && <p className="py-6 text-center text-[#9E9E9E]">Завантаження…</p>}
        <ul className="divide-y divide-[#F5F5F5] max-h-[60vh] overflow-y-auto">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div>
                <span className="font-medium text-[#212121]">{p.name}</span>
                <span className="ml-2 text-[11px] text-[#9E9E9E]">{p.brand}</span>
              </div>
              <span className={`font-semibold tabular-nums ${Number(p.stock_qty) === 0 ? "text-red-600" : "text-amber-600"}`}>
                {p.stock_qty} од.
              </span>
            </li>
          ))}
          {!loading && !products.length && (
            <li className="py-6 text-center text-[#9E9E9E]">Всі залишки вище порогу ✓</li>
          )}
        </ul>
      </div>
    </div>
  );
}
