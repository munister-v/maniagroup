"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminProducts } from "./AdminProducts";
import { SocialPostButton } from "./AiAssistant";
import { BulkPhotoMatcher } from "./BulkPhotoMatcher";
import { SubTabs } from "./intertop/primitives";

type Row = {
  id: string;
  name: string;
  brand: string;
  sku: string;
  category: string;
  gender: string;
  regular_price: number | null;
  sale_price: number | null;
  price: number | null;
  is_in_stock: boolean;
  status: string;
  image_src: string;
  featured: boolean;
  color: string;
  season: string;
  composition: string;
  /** Manufacturer's factory article (Заводський артикул) — distinct from our
   *  internal `sku`; the bridge code OFFERS/ОСТАТКИ files match on. */
  factory_article: string;
  /** Pre-formatted "DD.MM.YYYY HH:MM" from the list query. */
  updated_at?: string;
  /** Has real per-size stock rows — when true, is_in_stock is a MIRROR
   *  recomputed from those rows (see lib/erp.ts), not a free-standing flag. */
  has_variants: boolean;
  /** Per-product override of the site-wide "hide products with no photo"
   *  setting — see lib/productSource.ts hasImg. */
  show_without_photo: boolean;
  /** «Мова Українська» — see lib/pg.ts (Intertop 2.1). */
  name_uk?: string;
  description?: string;
  description_uk?: string;
  country?: string;
  /** "Матеріал верху" / "Підвид" — see lib/classifierTree.ts. */
  material?: string;
  subtype?: string;
  moderation_status?: string;
  /** Intertop 2.10 guide binding — see lib/sizeCharts.ts. */
  size_chart_code?: string;
  created_at?: string;
};

type Field = keyof Row;
type CellValue = string | number | boolean | null;

type Col = {
  key: Field;
  label: string;
  type: "text" | "number" | "bool" | "gender" | "status";
  w: number;
  sortable?: boolean;
};

const COLS: Col[] = [
// Widths are minimums; the table is w-full so on wide screens columns stretch
// to fill the whole width. Kept to the essential set so it fits a laptop with
// NO horizontal scroll — колір/сезон/склад/країна/опис are edited in the card
// (and колір/сезон are already filterable via the toolbar dropdowns).
  { key: "name", label: "Назва", type: "text", w: 190, sortable: true },
  { key: "brand", label: "Бренд", type: "text", w: 112, sortable: true },
  { key: "sku", label: "SKU", type: "text", w: 92, sortable: true },
  { key: "category", label: "Категорія", type: "text", w: 110, sortable: true },
  { key: "gender", label: "Стать", type: "gender", w: 74 },
  { key: "regular_price", label: "Ціна", type: "number", w: 82, sortable: true },
  { key: "sale_price", label: "Акція", type: "number", w: 82, sortable: true },
  { key: "is_in_stock", label: "Наявн.", type: "bool", w: 66, sortable: true },
  { key: "status", label: "Статус", type: "status", w: 98, sortable: true },
  { key: "featured", label: "Обр.", type: "bool", w: 56 },
];

// Excel-style column letters: 0→A, 25→Z, 26→AA
function colLetter(i: number): string {
  let n = i + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Whether the product is actually visible on the storefront right now, why
 * not if it isn't, and — when there's a one-click fix — exactly what that
 * fix would do. Mirrors the exact gating in lib/productSource.ts (status=
 * 'publish' + is_in_stock + (has a photo OR show_without_photo override)).
 * Surfaced directly in the grid so "I imported it but it's not on the site"
 * has an immediate, actionable answer instead of a trip through Налаштування.
 */
function siteStatus(row: Row): {
  label: string; dot: string; title: string;
  fix?: { patch: Partial<Pick<Row, "status" | "show_without_photo">>; label: string };
} {
  if (row.status !== "publish")
    return {
      label: "Приховано", dot: "bg-[#8a94a0]",
      title: "Товар знято з публікації (статус ≠ Опубл.) — на сайті не показується",
      fix: { patch: { status: "publish" }, label: "Опублікувати" },
    };
  if (!row.is_in_stock)
    return { label: "Без залишку", dot: "bg-[#b6c0ca]", title: "Немає в наявності (0 на складі) — на сайті не показується" };
  if (!row.image_src && !row.show_without_photo)
    return {
      label: "Без фото", dot: "bg-[#d97706]",
      title: "Немає фото — вітрина за замовчуванням ховає товари без фото",
      fix: { patch: { show_without_photo: true }, label: "Показати без фото" },
    };
  if (!row.image_src && row.show_without_photo)
    return { label: "LIVE · без фото", dot: "bg-[#2e7d32]", title: "Показано на сайті попри відсутність фото (ручний дозвіл)" };
  return { label: "LIVE", dot: "bg-[#2e7d32]", title: "Товар видно на сайті" };
}

/** One documentation card in the help panel — icon badge + title + body. */
function HelpCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[5px] border border-[#e6eaec] bg-[#f7f9fa] p-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#8a94a0] shadow-[0_0_0_1px_#e6eaec]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[12px] font-semibold text-[#2b2d42]">{title}</p>
        <div className="space-y-1.5 text-[12px] leading-relaxed text-[#5a6472]">{children}</div>
      </div>
    </div>
  );
}
const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;

const PER_PAGE_OPTIONS = [50, 100, 200, 500];

// Export column names — must match the server's localized headers (export route).
const EXPORT_COLUMNS = [
  "ID", "SKU", "Назва", "Бренд", "Категорія", "Стать", "Ціна", "Акційна",
  "Підсумкова", "В наявності", "Статус", "Колір", "Сезон", "Склад", "Країна",
  "Матеріал", "Підвид", "Розміри", "Slug", "Фото",
];

type CatalogFocus = { stock?: string; siteStatus?: string; token: number } | null;

export function CatalogGrid({ onToast, onImport, dataVersion = 0, focus = null }: { onToast?: (m: string) => void; onImport?: () => void; dataVersion?: number; focus?: CatalogFocus }) {
  const [mode, setMode] = useState<"grid" | "cards" | "list">("list");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("");
  const [brand, setBrand] = useState("");
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [perPage, setPerPage] = useState(100);
  // In the Intertop-clone "list" mode the filter row is hidden behind the
  // funnel icon (like Intertop); grid/cards always show it. Default open.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, Partial<Record<Field, CellValue>>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkPhotoOpen, setBulkPhotoOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [cardsInitial, setCardsInitial] = useState<{ kind: "new" } | { kind: "edit"; id: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);

  // Extended filters + facets
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [color, setColor] = useState("");
  const [season, setSeason] = useState("");
  const [statusF, setStatusF] = useState("");
  const [siteStatusF, setSiteStatusF] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [facets, setFacets] = useState<{
    categories: { slug: string; name: string; count: number }[];
    colors: string[]; seasons: string[];
  }>({ categories: [], colors: [], seasons: [] });

  // Export dialog state
  const [exportScope, setExportScope] = useState<"all" | "filtered" | "selected" | "page">("filtered");
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exportCols, setExportCols] = useState<Set<string>>(new Set(EXPORT_COLUMNS));

  // Excel-style active cell + cell input refs for keyboard nav
  const [active, setActive] = useState<{ row: string; col: Field } | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());

  /** Shared filter params (everything except pagination/sort). */
  const filterParams = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (stock) p.set("stock", stock);
    if (brand) p.set("brand", brand);
    if (category) p.set("category", category);
    if (gender) p.set("gender", gender);
    if (color) p.set("color", color);
    if (season) p.set("season", season);
    if (statusF) p.set("status", statusF);
    if (siteStatusF) p.set("siteStatus", siteStatusF);
    if (minPrice) p.set("minPrice", minPrice);
    if (maxPrice) p.set("maxPrice", maxPrice);
    return p;
  }, [search, stock, brand, category, gender, color, season, statusF, siteStatusF, minPrice, maxPrice]);

  const activeFilters = [stock, brand, category, gender, color, season, statusF, siteStatusF, minPrice, maxPrice].filter(Boolean).length;
  function resetFilters() {
    setStock(""); setBrand(""); setCategory(""); setGender(""); setColor("");
    setSeason(""); setStatusF(""); setSiteStatusF(""); setMinPrice(""); setMaxPrice(""); setPage(1);
  }

  // Apply a one-shot filter request from outside (e.g. Overview's "N товарів
  // без фото" task) — keyed on `token` so clicking the same task twice still
  // re-applies it even if the admin had since cleared the filter by hand.
  useEffect(() => {
    if (!focus) return;
    setStock(focus.stock ?? "");
    setSiteStatusF(focus.siteStatus ?? "");
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token]);

  function openFullNew() { setCardsInitial({ kind: "new" }); setMode("cards"); }
  function openFullCard(id: string) { setCardsInitial({ kind: "edit", id }); setMode("cards"); }

  const dirtyCount = Object.keys(edits).length;

  const load = useCallback(async () => {
    // Guard against out-of-order responses: if filters change quickly (e.g. a
    // dashboard deep-link firing right after the initial unfiltered mount
    // request), an earlier, slower request can otherwise resolve AFTER a
    // newer one and overwrite the grid with stale/wrong rows.
    const seq = ++loadSeq.current;
    const params = filterParams();
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    const res = await fetch(`/api/admin/products?${params}`);
    const data = await res.json();
    if (seq !== loadSeq.current) return; // a newer request has since started
    setRows(data.products ?? []);
    setTotal(data.total ?? 0);
    setSelected(new Set());
    setEdits({});
    setLoading(false);
  }, [page, perPage, sortBy, sortDir, filterParams]);

  // Reload rows on filter/sort/page changes and after an import (dataVersion).
  useEffect(() => { if (mode !== "cards") load(); }, [load, mode, dataVersion]);

  // Filter facets (brands / categories / colors) — refresh after an import too,
  // so a newly imported brand shows up in the dropdowns.
  useEffect(() => {
    fetch("/api/admin/products/price-rule")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
      .catch(() => {});
    fetch("/api/admin/products/facets")
      .then((r) => r.json())
      .then((d) => setFacets({ categories: d.categories ?? [], colors: d.colors ?? [], seasons: d.seasons ?? [] }))
      .catch(() => {});
  }, [dataVersion]);

  function onSearch(v: string) {
    setSearch(v);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(), 350);
  }

  function toggleSort(key: Field) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("asc"); }
    setPage(1);
  }

  function cell(row: Row, key: Field): CellValue {
    const e = edits[row.id];
    if (e && key in e) return e[key] as CellValue;
    return row[key] as CellValue;
  }

  function setCell(id: string, key: Field, value: CellValue) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }));
  }

  async function saveEdits() {
    const updates = Object.entries(edits)
      .map(([id, fields]) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (k === "regular_price") out[k] = v === "" || v == null ? 0 : Number(v);
          else if (k === "sale_price") out[k] = v === "" || v == null ? null : Number(v);
          else out[k] = v;
        }
        return { id, fields: out };
      })
      .filter((u) => Object.keys(u.fields).length > 0);
    if (updates.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (res.ok) { onToast?.(`Збережено: ${data.count} товарів`); await load(); }
      else onToast?.(data.error ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  function discardEdits() { setEdits({}); }

  // One-click fix from the "На сайті" badge — publish, or show without a
  // photo — instead of making the admin hunt for the right column/toggle.
  const [fixingId, setFixingId] = useState<string | null>(null);
  async function quickFix(id: string, patch: Partial<Pick<Row, "status" | "show_without_photo">>) {
    setFixingId(id);
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) { onToast?.("Готово — товар на сайті"); await load(); }
      else onToast?.("Помилка");
    } finally { setFixingId(null); }
  }

  const SKIP_HINT: Record<string, string> = {
    in_stock: "керуються розмірами (див. «Картка»)", out_of_stock: "керуються розмірами (див. «Картка»)",
    archive: "не в статусі «На сайті»", delete: "вже були на сайті — див. архівацію",
  };

  // ── Bulk row actions ─────────────────────────────────────────────────────
  async function bulk(action: string) {
    if (selected.size === 0) return;
    // Guide 2.7 §2: bulk archiving caps at 100 cards per call — check up
    // front instead of round-tripping to the server just to be rejected.
    if (action === "archive" && selected.size > 100) {
      onToast?.(`За раз можна архівувати максимум 100 товарів (обрано ${selected.size})`);
      return;
    }
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    if (res.ok) {
      const d = await res.json().catch(() => null);
      onToast?.(d?.skipped ? `Готово · ${d.skipped} пропущено — ${SKIP_HINT[action] ?? "не підходять"}` : "Готово");
      await load();
    } else {
      const d = await res.json().catch(() => null);
      onToast?.(d?.error ?? "Помилка");
    }
  }

  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  // ── Excel cell navigation ─────────────────────────────────────────────────
  const setRef = (rowId: string, col: Field) => (el: HTMLInputElement | HTMLSelectElement | null) => {
    const k = `${rowId}|${col}`;
    if (el) cellRefs.current.set(k, el); else cellRefs.current.delete(k);
  };
  function moveVertical(rowId: string, col: Field, dir: 1 | -1) {
    const idx = rows.findIndex((r) => r.id === rowId);
    const next = rows[idx + dir];
    if (!next) return;
    setActive({ row: next.id, col });
    requestAnimationFrame(() => cellRefs.current.get(`${next.id}|${col}`)?.focus());
  }
  function cellKey(e: KeyboardEvent<HTMLElement>, rowId: string, col: Field) {
    if (e.key === "Enter") { e.preventDefault(); moveVertical(rowId, col, e.shiftKey ? -1 : 1); }
  }

  // ── Export ───────────────────────────────────────────────────────────────
  // Build export params for the chosen scope + selected columns.
  function buildExportParams(format: string): URLSearchParams {
    let params: URLSearchParams;
    if (exportScope === "filtered") params = filterParams();
    else params = new URLSearchParams();
    params.set("format", format);
    if (exportScope === "selected" && selected.size) params.set("ids", [...selected].join(","));
    if (exportScope === "page") params.set("ids", rows.map((r) => r.id).join(","));
    if (exportCols.size && exportCols.size < EXPORT_COLUMNS.length) {
      params.set("cols", EXPORT_COLUMNS.filter((c) => exportCols.has(c)).join(","));
    }
    return params;
  }

  async function doExport() {
    const format = exportFormat;
    const params = buildExportParams(format);
    if (format === "pdf") {
      // PDF prints the full scope: fetch the json rows, then build a print view.
      params.set("format", "json");
      const res = await fetch(`/api/admin/products/export?${params}`);
      const data: Record<string, string | number>[] = await res.json();
      printRows(data);
    } else {
      const a = document.createElement("a");
      a.href = `/api/admin/products/export?${params}`;
      a.click();
    }
    setExportOpen(false);
  }

  function printRows(data: Record<string, string | number>[]) {
    const cols = EXPORT_COLUMNS.filter((c) => !exportCols.size || exportCols.has(c));
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const head = cols.map((h) => `<th>${esc(h)}</th>`).join("");
    const body = data
      .map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Каталог Mania Group</title>
      <style>
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2b2d42;padding:24px}
        h1{font-size:18px;margin:0 0 4px} p{color:#888;font-size:12px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
        th{background:#f7f9fa;text-transform:uppercase;font-size:9px;letter-spacing:.04em}
        tr:nth-child(even){background:#f7f9fa}
      </style></head><body>
      <h1>Каталог Mania Group</h1>
      <p>${data.length} позицій · ${new Date().toLocaleString("uk-UA")}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  if (mode === "cards") {
    return (
      <div>
        <ModeToggle mode={mode} setMode={(m) => { if (m === "cards") setCardsInitial(null); setMode(m); }} onImport={onImport} onNew={openFullNew} onBulkPhotos={() => setBulkPhotoOpen(true)} />
        <AdminProducts onToast={onToast} initialOpen={cardsInitial} />
        {bulkPhotoOpen && <BulkPhotoMatcher onClose={() => setBulkPhotoOpen(false)} onToast={onToast} />}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const inp = "h-7 w-full bg-transparent px-1.5 text-[13px] leading-7 text-[#2b2d42] outline-none";

  // Active-cell derived values for the formula bar
  const aRow = active ? rows.find((r) => r.id === active.row) ?? null : null;
  const aColIdx = active ? COLS.findIndex((c) => c.key === active.col) : -1;
  const aCol = aColIdx >= 0 ? COLS[aColIdx] : null;
  const aRowNum = aRow ? (page - 1) * perPage + rows.findIndex((r) => r.id === aRow.id) + 1 : 0;
  const aRef = aCol && aRow ? `${colLetter(aColIdx)}${aRowNum}` : "";
  const aEditable = !!aCol && (aCol.type === "text" || aCol.type === "number");

  return (
    <div className="flex flex-col">
      <ModeToggle mode={mode} setMode={(m) => { if (m === "cards") setCardsInitial(null); setMode(m); }} onImport={onImport} onNew={openFullNew} onBulkPhotos={() => setBulkPhotoOpen(true)} />

      {/* Intertop-clone header for the "list" mode — big title + selection
          count + the exact action-button cluster (Створити/Завантажити +
          selection-gated Деактивувати/На модерацію/В чернетку + preview/export/
          filter icon buttons). */}
      {mode === "list" && (() => {
        const gated = "flex h-9 items-center gap-1.5 rounded-[4px] border px-3.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors border-[#d5dbe0] text-[#5a6472] hover:enabled:border-[#2b2d42] hover:enabled:text-[#2b2d42] disabled:cursor-not-allowed disabled:border-[#eef2f3] disabled:text-[#c3ccd4]";
        const primary = "flex h-9 items-center gap-1.5 rounded-[4px] border border-[#2f9488] px-3.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white";
        const icon = "flex h-9 w-9 items-center justify-center rounded-[4px] border border-[#2f9488] text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white";
        return (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Список товарів</h2>
              <p className="mt-0.5 text-[12px] text-[#8a94a0]">
                {selected.size > 0 ? `Обрано ${selected.size} з ${total.toLocaleString("uk-UA")}` : `Вибрано продуктів ${total.toLocaleString("uk-UA")}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={openFullNew} className={primary}>
                Створити товар
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
              </button>
              <button onClick={() => onImport?.()} className={primary}>
                Завантажити товари
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button disabled={!selected.size} onClick={() => bulk("out_of_stock")} className={gated}>
                Деактивувати<span className="text-[13px] leading-none">−</span>
              </button>
              <button disabled={!selected.size} onClick={() => bulk("publish")} className={gated}>
                На модерацію
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" strokeLinecap="round" /></svg>
              </button>
              <button disabled={!selected.size} onClick={() => bulk("unpublish")} className={gated}>
                В чернетку
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3v4a1 1 0 001 1h4M9 13h6M9 17h6M8 21h8a2 2 0 002-2V7l-5-4H8a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button disabled={!selected.size} onClick={() => bulk("archive")} title="Архівувати (тільки товари в статусі «На сайті», макс. 100)" className={gated}>
                В архів
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 13h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <a href="/" target="_blank" rel="noreferrer" title="Переглянути на сайті" className={icon}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              </a>
              <button onClick={() => { setExportScope(selected.size ? "selected" : "filtered"); setExportOpen(true); }} title="Експорт" className={icon}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              </button>
              <button onClick={() => setFiltersOpen((v) => !v)} title="Фільтри"
                className={`flex h-9 w-9 items-center justify-center rounded-[4px] border transition-colors ${filtersOpen ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#2f9488] text-[#2f9488] hover:bg-[#2f9488] hover:text-white"}`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        );
      })()}

      {mode === "list" && (
        <SubTabs
          tabs={[
            { id: "", label: "Всі товари" },
            { id: "publish", label: "На сайті" },
            { id: "draft", label: "Чернетки" },
          ]}
          active={statusF}
          onChange={(v) => { setStatusF(v); setPage(1); }}
        />
      )}

      {mode === "grid" && (<>
      {/* Intro / how-to — one compact line, expands on demand */}
      <div className="mb-3 flex items-center gap-2 rounded-[4px] border border-[#e6eaec] bg-[#f7f9fa] px-3.5 py-2 text-[12px] text-[#5a6472]">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[#8a94a0]" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
        <span className="min-w-0 flex-1 truncate">
          <b className="text-[#2b2d42]">Таблиця як Excel</b> — клікніть клітинку, редагуйте, <b>Enter</b>/<b>Tab</b> — рух, потім «Зберегти всі».
        </span>
        <button onClick={() => setHelpOpen((v) => !v)} className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0] hover:text-[#2b2d42]">
          {helpOpen ? "Згорнути" : "Докладніше"}
        </button>
      </div>
      {helpOpen && (
        <div className="mb-3 grid gap-2.5 md:grid-cols-2">
          <HelpCard
            title="Як редагувати й що саме зберігається"
            icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON_STROKE}><path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.1 2.1 0 013 3L12 16l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          >
            <p>
              Клік по клітинці робить її активною (зелена рамка) — саме тоді значення видно й у рядку формул <span className="font-mono text-[11px]">fx</span> вгорі таблиці.
              Введене значення одразу підсвічує <b>весь рядок жовтим</b> — це «незбережена зміна», вона ще ніде не записана.
              <b>Enter</b> переходить у ту саму колонку на рядок нижче, <b>Tab</b> — на наступну колонку.
            </p>
            <p>
              Кнопка <b>«Зберегти всі»</b> надсилає ВСІ правки одним запитом. Сервер оновлює кожен товар окремо: якщо змінилась ціна — перераховує підсумкову
              (акційна, якщо менша за базову, інакше базова). Кожне збереження логується в <b>Моніторинг → журнал активності</b>.
            </p>
            <p>
              <b>Наявність</b> і <b>Обране</b> — прямі перемикачі, а не реальні розмірні залишки: якщо у товару є розмірна сітка, «Наявність»
              <b> автоматично перерахується</b> з суми залишків при наступному імпорті ОСТАТКИ. Для точного контролю відкривайте <b>«Картка»</b>.
            </p>
          </HelpCard>

          <HelpCard
            title="Пошук і фільтри — як саме звужується список"
            icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON_STROKE}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>}
          >
            <p>
              Поле пошуку шукає одночасно в назві, бренді й артикулі (з затримкою 350мс, щоб не бомбардувати сервер на кожну літеру).
              Кожен фільтр додає ще одну умову — всі діють одночасно (логічне «І»): «бренд + наявність + ціна від 1000» покаже тільки товари,
              що відповідають усім трьом одразу. Кнопка «Скинути (N)» знімає всі фільтри разом.
            </p>
          </HelpCard>

          <HelpCard
            title="Масові дії та експорт — з чим саме працюють"
            icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON_STROKE}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></svg>}
          >
            <p>
              Клік по <b>номеру рядка</b> ліворуч виділяє рядок, кутик угорі — всі рядки на сторінці. Масові дії (опублікувати/сховати/наявність/обране/видалити)
              виконуються одним SQL-запитом по всіх вибраних id — швидко навіть для сотень товарів.
            </p>
            <p>
              <b>Експорт</b> дає вибір обсягу: весь каталог, поточний фільтр, вибрані рядки або поточна сторінка — і формату (Excel/CSV/JSON/PDF-друк).
              Обидві дії записуються в журнал активності.
            </p>
          </HelpCard>

          <HelpCard
            title="«Фото масово» — як система впізнає, якому товару належить файл"
            icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON_STROKE}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" /></svg>}
          >
            <p>
              Для кожного файлу система бере назву без розширення (напр. <span className="font-mono">90101-2.jpg</span> → <span className="font-mono">90101-2</span>)
              і шукає серед товарів <b>найдовший</b> відомий SKU або заводський артикул, що є початком цієї назви — працює і для простих кодів
              (<span className="font-mono">90101</span>), і для складних (<span className="font-mono">DEMO-PALTO-01</span>).
            </p>
            <p>
              Залишок назви після коду (напр. «-2») зчитується як номер фото і визначає порядок — перше фото стає головним. Кожне фото автоматично
              стискається й перекодовується у WebP (до 2000px). Нерозпізнані файли показуються окремим списком — прив'язати можна вручну через «Картка».
            </p>
          </HelpCard>

          <HelpCard
            title="Картка товару — розміри й реальні залишки"
            icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...ICON_STROKE}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 15h4" strokeLinecap="round" /></svg>}
          >
            <p>
              У картці розміри вводяться парами «розмір + кількість» — кожен рядок стає справжнім записом залишку в системі (не текстовою міткою).
              Поле <b>«Заводський артикул постачальника»</b> — місток: саме за ним файл ОСТАТКИ пізніше знаходить товар і оновлює кількість/ціну автоматично.
              Без артикулу товар, створений вручну, залишиться недосяжним для автооновлення.
            </p>
          </HelpCard>
        </div>
      )}
      </>)}

      {/* Toolbar — search + filters + export. Hidden in list mode until the
          funnel icon toggles it (Intertop-style); always shown otherwise. */}
      {(mode !== "list" || filtersOpen) && (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Пошук: назва, бренд, артикул…"
          className="h-9 w-56 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none"
        />
        <select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Усі</option>
          <option value="in">В наявності</option>
          <option value="out">Немає</option>
        </select>
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}
          className="h-9 max-w-44 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Усі бренди</option>
          {brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="h-9 max-w-44 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Усі категорії</option>
          {facets.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>)}
        </select>
        <select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Стать</option>
          <option value="women">Жіноче</option>
          <option value="men">Чоловіче</option>
        </select>
        <select value={color} onChange={(e) => { setColor(e.target.value); setPage(1); }}
          className="h-9 max-w-36 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Колір</option>
          {facets.colors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }}
          className="h-9 max-w-36 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Сезон</option>
          {facets.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">Статус</option>
          <option value="publish">Опубліковані</option>
          <option value="draft">Чернетки</option>
        </select>
        <select value={siteStatusF} onChange={(e) => { setSiteStatusF(e.target.value); setPage(1); }}
          title="Чи видно товар на сайті прямо зараз"
          className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          <option value="">На сайті: всі</option>
          <option value="live">🟢 LIVE</option>
          <option value="no_photo">🟡 Без фото</option>
          <option value="out_of_stock">⚪ Без залишку</option>
          <option value="hidden">⏸ Приховані</option>
        </select>
        <input value={minPrice} onChange={(e) => { setMinPrice(e.target.value.replace(/\D/g, "")); setPage(1); }}
          placeholder="₴ від" inputMode="numeric"
          className="h-9 w-20 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none" />
        <input value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value.replace(/\D/g, "")); setPage(1); }}
          placeholder="₴ до" inputMode="numeric"
          className="h-9 w-20 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none" />
        {activeFilters > 0 && (
          <button onClick={resetFilters}
            className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
            Скинути ({activeFilters})
          </button>
        )}
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}/стор.</option>)}
        </select>

        {/* Refresh — re-pull latest rows + facets */}
        <button
          onClick={() => { setLoading(true); load(); }}
          title="Оновити дані"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] transition-colors hover:border-[#2f9488] hover:text-[#2f9488]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11A8 8 0 006 5.3L3 8m0 0V3m0 5h5m-5 5a8 8 0 0014 5.7l3-2.7m0 0v5m0-5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Оновити
        </button>

        {/* Export — opens settings dialog */}
        <button
          onClick={() => { setExportScope(selected.size ? "selected" : "filtered"); setExportOpen(true); }}
          className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Експорт{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>
      )}

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          scope={exportScope} setScope={setExportScope}
          format={exportFormat} setFormat={setExportFormat}
          cols={exportCols} setCols={setExportCols}
          total={total} filteredHint={activeFilters > 0 || !!search}
          selectedCount={selected.size} pageCount={rows.length}
          onExport={doExport}
        />
      )}

      {bulkPhotoOpen && <BulkPhotoMatcher onClose={() => { setBulkPhotoOpen(false); load(); }} onToast={onToast} />}

      {/* Sticky save bar when dirty */}
      {dirtyCount > 0 && (
        <div className="sticky top-0 z-30 mb-2 flex items-center gap-3 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-[12px] text-amber-800">Незбережені зміни: <b>{dirtyCount}</b> товарів</span>
          <button onClick={saveEdits} disabled={saving}
            className="ml-auto h-8 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            {saving ? "Зберігаємо…" : "Зберегти всі"}
          </button>
          <button onClick={discardEdits} className="text-[11px] uppercase tracking-[0.1em] text-[#8a94a0] hover:text-[#2b2d42]">Скасувати</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#e6eaec] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.1em]">
          <span className="text-[#8a94a0]">Обрано {selected.size}</span>
          {[
            { a: "publish", l: "Опублікувати" }, { a: "unpublish", l: "Сховати" },
            { a: "in_stock", l: "В наявн." }, { a: "out_of_stock", l: "Немає" },
            { a: "feature", l: "В обране" }, { a: "unfeature", l: "З обраного" },
            { a: "show_without_photo", l: "Показати без фото" }, { a: "hide_without_photo", l: "Сховати без фото" },
          ].map((b) => (
            <button key={b.a} onClick={() => bulk(b.a)} className="text-[#2b2d42] underline-offset-2 hover:underline">{b.l}</button>
          ))}
          <button onClick={() => bulk("archive")} title="Тільки товари в статусі «На сайті», макс. 100"
            className="text-[#2b2d42] underline-offset-2 hover:underline">В архів</button>
          <button onClick={() => { if (confirm(`Видалити ${selected.size} товарів?`)) bulk("delete"); }}
            className="text-red-600 underline-offset-2 hover:underline">Видалити</button>
        </div>
      )}

      {mode === "grid" && (<>
      {/* Formula bar (Excel-style) */}
      <div className="flex items-stretch border border-b-0 border-[#d5dbe0] bg-[#f7f9fa] text-[13px]">
        <div className="flex w-[94px] shrink-0 items-center justify-center border-r border-[#d5dbe0] px-2 font-medium tabular-nums text-[#444]">
          {aRef || "—"}
        </div>
        <div className="flex w-9 shrink-0 items-center justify-center border-r border-[#d5dbe0] font-serif text-[15px] italic text-[#9a9a9a]">fx</div>
        <input
          value={aRow && aCol ? String(cell(aRow, aCol.key) ?? "") : ""}
          readOnly={!aEditable}
          onChange={(e) => aRow && aCol && setCell(aRow.id, aCol.key, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && aRow && aCol) moveVertical(aRow.id, aCol.key, 1); }}
          placeholder="Оберіть клітинку для редагування…"
          className="h-8 flex-1 bg-white px-2.5 text-[#2b2d42] outline-none placeholder:text-[#bbb] read-only:bg-[#fafafa] read-only:text-[#8a8a8a]"
        />
      </div>

      {/* Grid — Excel look */}
      <div className="max-h-[68vh] overflow-auto border border-[#d5dbe0] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {/* select-all corner */}
              <th className="sticky left-0 top-0 z-30 w-10 min-w-10 border-b border-r border-[#d5dbe0] bg-[#eef2f3] p-0">
                <button onClick={toggleAll} title="Виділити все" className="relative block h-full min-h-[38px] w-full">
                  <span className="absolute bottom-[3px] right-[3px] h-0 w-0 border-b-[7px] border-l-[7px] border-b-[#9a9a9a] border-l-transparent" />
                </button>
              </th>
              {/* photo (frozen) */}
              <th className="sticky left-10 top-0 z-30 w-11 min-w-11 border-b border-r border-[#d5dbe0] bg-[#eef2f3] text-center align-bottom">
                <div className="pb-1 text-[10px] text-[#8a8a8a]">Фото</div>
              </th>
              {/* site status (computed, not editable) */}
              <th className="top-0 z-20 w-[132px] min-w-[132px] border-b border-r border-[#d5dbe0] bg-[#eef2f3] text-center align-bottom">
                <div className="pb-1 text-[10px] text-[#8a8a8a]">На сайті</div>
              </th>
              {COLS.map((c, ci) => {
                const isActiveCol = active?.col === c.key;
                return (
                  <th key={c.key} style={{ minWidth: c.w }}
                    className={`sticky top-0 z-20 border-b border-r border-[#d5dbe0] px-2 pb-1 pt-0.5 text-left align-bottom ${isActiveCol ? "bg-[#e3f2f0]" : "bg-[#eef2f3]"}`}>
                    <div className={`text-center text-[10px] font-normal leading-none ${isActiveCol ? "text-[#2f9488]" : "text-[#8a8a8a]"}`}>{colLetter(ci)}</div>
                    {c.sortable ? (
                      <button onClick={() => toggleSort(c.key)} className="mt-1 flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-[#3a4250] hover:text-[#2f9488]">
                        {c.label}{sortBy === c.key && <span className="text-[#2f9488]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    ) : (
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.03em] text-[#3a4250]">{c.label}</div>
                    )}
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 w-16 min-w-16 border-b border-[#d5dbe0] bg-[#eef2f3]" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={COLS.length + 4} className="px-3 py-10 text-center text-[#8a94a0]">Завантаження…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={COLS.length + 4} className="px-3 py-10 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            )}
            {!loading && rows.map((row, ri) => {
              const rowDirty = !!edits[row.id];
              const isSel = selected.has(row.id);
              const isActiveRow = active?.row === row.id;
              const rowNum = (page - 1) * perPage + ri + 1;
              return (
                <tr key={row.id} className={rowDirty ? "bg-[#fff8e6]" : "hover:bg-[#eef7f6]"}>
                  {/* row number / row select */}
                  <td onClick={() => toggleRow(row.id)} title="Клік — виділити рядок"
                    className={`sticky left-0 z-10 h-7 cursor-pointer select-none border-b border-r text-center text-[11px] tabular-nums ${
                      isSel ? "border-[#277d73] bg-[#2f9488] font-semibold text-white"
                      : isActiveRow ? "border-[#d5dbe0] bg-[#e3f2f0] font-semibold text-[#2f9488]"
                      : "border-[#e6eaec] bg-[#eef2f3] text-[#8a8a8a] hover:bg-[#e4e4e4]"}`}>
                    {rowNum}
                  </td>
                  {/* photo (frozen) */}
                  <td className={`sticky left-10 z-10 border-b border-r border-[#e6eaec] p-0 ${isSel ? "bg-[#eef7f6]" : "bg-white"}`}>
                    <div className="flex h-7 items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {row.image_src
                        ? <img src={row.image_src} alt="" className="h-6 w-6 rounded-[1px] object-cover" />
                        : <div className="h-6 w-6 rounded-[1px] bg-[#eee]" />}
                    </div>
                  </td>
                  {/* site status — a badge, or a one-click fix when one exists */}
                  {(() => {
                    const st = siteStatus(row);
                    return (
                      <td title={st.title} className={`border-b border-r border-[#e6eaec] px-1.5 ${isSel ? "bg-[#eef7f6]" : ""}`}>
                        {st.fix ? (
                          <button onClick={() => quickFix(row.id, st.fix!.patch)} disabled={fixingId === row.id}
                            className="flex w-full items-center justify-center gap-1 rounded-[2px] border border-[#e0e0e0] bg-white px-1 py-0.5 text-[10px] text-[#2f9488] hover:border-[#2f9488] disabled:opacity-50">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                            {fixingId === row.id ? "…" : st.fix.label}
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                            <span className="truncate text-[10.5px] text-[#5a6472]">{st.label}</span>
                          </div>
                        )}
                      </td>
                    );
                  })()}
                  {COLS.map((c) => {
                    const isActive = isActiveRow && active?.col === c.key;
                    const num = c.type === "number";
                    return (
                      <td key={c.key}
                        onClick={() => setActive({ row: row.id, col: c.key })}
                        className={`border-b border-r border-[#e6eaec] p-0 ${isSel ? "bg-[#eef7f6]" : ""}`}
                        style={isActive ? { boxShadow: "inset 0 0 0 2px #2f9488" } : undefined}>
                        {c.type === "bool" ? (
                          c.key === "is_in_stock" && row.has_variants ? (
                            <div className="flex h-7 items-center justify-center" title="Розраховується автоматично із залишків розмірів — редагуйте в «Картці», а не тут">
                              <input type="checkbox" checked={Boolean(cell(row, c.key))} disabled
                                className="h-3.5 w-3.5 accent-[#b6c0ca] cursor-not-allowed" />
                            </div>
                          ) : (
                            <div className="flex h-7 items-center justify-center">
                              <input type="checkbox" checked={Boolean(cell(row, c.key))}
                                onChange={(e) => setCell(row.id, c.key, e.target.checked)} className="h-3.5 w-3.5 accent-[#2f9488]" />
                            </div>
                          )
                        ) : c.type === "gender" ? (
                          <select ref={setRef(row.id, c.key)} value={String(cell(row, c.key) ?? "")}
                            onFocus={() => setActive({ row: row.id, col: c.key })}
                            onKeyDown={(e) => cellKey(e, row.id, c.key)}
                            onChange={(e) => setCell(row.id, c.key, e.target.value)} className={inp}>
                            <option value="">—</option>
                            <option value="men">Чол.</option>
                            <option value="women">Жін.</option>
                          </select>
                        ) : c.type === "status" ? (
                          <select ref={setRef(row.id, c.key)} value={String(cell(row, c.key) ?? "")}
                            onFocus={() => setActive({ row: row.id, col: c.key })}
                            onKeyDown={(e) => cellKey(e, row.id, c.key)}
                            onChange={(e) => setCell(row.id, c.key, e.target.value)} className={inp}>
                            <option value="publish">Опубл.</option>
                            <option value="draft">Чернетка</option>
                          </select>
                        ) : (
                          <input ref={setRef(row.id, c.key)} type={num ? "number" : "text"}
                            value={(cell(row, c.key) ?? "") as string | number}
                            onFocus={() => setActive({ row: row.id, col: c.key })}
                            onKeyDown={(e) => cellKey(e, row.id, c.key)}
                            onChange={(e) => setCell(row.id, c.key, e.target.value)}
                            className={`${inp} ${num ? "text-right tabular-nums" : ""}`} />
                        )}
                      </td>
                    );
                  })}
                  <td className={`border-b border-[#e6eaec] px-2 ${isSel ? "bg-[#eef7f6]" : ""}`}>
                    <div className="flex items-center justify-end gap-1">
                      <SocialPostButton
                        product={{
                          name: row.name,
                          brand: row.brand,
                          category: row.category,
                          color: row.color,
                          season: row.season,
                          composition: row.composition,
                          price: String(row.price ?? row.regular_price ?? 0),
                          oldPrice: row.sale_price != null && row.regular_price != null && row.sale_price < row.regular_price ? String(row.regular_price) : undefined,
                          inStock: String(row.is_in_stock),
                        }}
                        onToast={onToast}
                      />
                      <button onClick={() => openFullCard(row.id)} title="Відкрити картку товару"
                        className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#c9c9c9] bg-white text-[#3a4250] transition-colors hover:border-[#2f9488] hover:text-[#2f9488]">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5m-1.5-9.5a2.1 2.1 0 013 3L12 16l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Excel status bar + sheet tab */}
      <div className="flex items-center justify-between border border-t-0 border-[#d5dbe0] bg-[#f3f3f3] px-1.5 py-1 text-[11px] text-[#555]">
        <div className="flex items-end gap-0.5">
          <span className="rounded-t-[3px] border border-b-0 border-[#d5dbe0] bg-white px-3 py-0.5 font-medium text-[#2f9488]">Товари</span>
          <span className="px-1.5 text-[#aaa]">＋</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>Записів: {total.toLocaleString("uk-UA")}</span>
          {selected.size > 0 && <span className="font-medium text-[#2f9488]">Виділено: {selected.size}</span>}
          {dirtyCount > 0 && <span className="font-medium text-[#b8860b]">Змінено: {dirtyCount}</span>}
          <span>Стор. {page} / {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="h-6 rounded-[2px] border border-[#c9c9c9] bg-white px-2 disabled:opacity-30 hover:enabled:border-[#2f9488]">‹</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="h-6 rounded-[2px] border border-[#c9c9c9] bg-white px-2 disabled:opacity-30 hover:enabled:border-[#2f9488]">›</button>
          </div>
        </div>
      </div>
      </>)}

      {mode === "list" && (
        <ProductListView
          rows={rows} loading={loading} total={total} page={page} perPage={perPage}
          setPage={setPage} setPerPage={setPerPage} totalPages={totalPages}
          selected={selected} toggleRow={toggleRow} toggleAll={toggleAll}
          onOpen={openFullCard}
        />
      )}

      {/* Danger zone — deliberately tucked away at the very bottom, separate
          from every normal action, so it's never one accidental click away. */}
      <div className="mt-6 rounded-[4px] border border-red-200 bg-red-50/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-red-800">Небезпечна зона</p>
            <p className="text-[11px] text-red-700">Повне видалення каталогу — усі товари з бази, без винятків.</p>
          </div>
          <button onClick={() => setWipeOpen(true)}
            className="h-8 shrink-0 rounded-[3px] border border-red-300 bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-red-700 hover:bg-red-600 hover:text-white">
            Видалити весь каталог
          </button>
        </div>
      </div>
      {wipeOpen && <WipeAllDialog onClose={() => setWipeOpen(false)} total={total} onDone={() => { setPage(1); load(); }} />}
    </div>
  );
}

function ModeToggle({ mode, setMode, onImport, onNew, onBulkPhotos }: { mode: "grid" | "cards" | "list"; setMode: (m: "grid" | "cards" | "list") => void; onImport?: () => void; onNew?: () => void; onBulkPhotos?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-[3px] border border-[#e6eaec] p-0.5">
        <button onClick={() => setMode("grid")}
          className={`h-8 rounded-[2px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${mode === "grid" ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"}`}>
          Таблиця
        </button>
        <button onClick={() => setMode("list")}
          className={`h-8 rounded-[2px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${mode === "list" ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"}`}>
          Список
        </button>
        <button onClick={() => setMode("cards")}
          className={`h-8 rounded-[2px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${mode === "cards" ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"}`}>
          Картки + фото
        </button>
      </div>
      {mode !== "list" && (
      <div className="ml-auto flex items-center gap-2">
        {onNew && (
          <button onClick={onNew}
            className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#2f9488] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            Новий товар
          </button>
        )}
        {onBulkPhotos && (
          <button onClick={onBulkPhotos} title="Масово прив'язати фото за назвою файлу (SKU/артикул)"
            className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#2f9488] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm2 11l4-5 3 4 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z" /></svg>
            Фото масово
          </button>
        )}
        {onImport && (
          <button onClick={onImport}
            className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#2f9488] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 15V3m0 0L8 7m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Імпорт XLS
          </button>
        )}
      </div>
      )}
    </div>
  );
}

/** Extra product-level columns beyond the always-shown core (ID товару ·
 *  Назва (рос.) · Зображення · Категорія · Код товару · Заводський артикул ·
 *  SKU · Статус · Публікувався · Востаннє змінено), exposed via a «Колонки»
 *  chooser — same pattern as AdminVariants' OPT_COLS. Sourced from the real
 *  odezda.xlsx template's fill-rate audit (2026-07-10): every field here is
 *  100%-or-near-100% populated in a real Intertop export and already stored
 *  on `products` (name_uk/description/description_uk since the 2.1 guide,
 *  material/subtype since the odezda structure adoption, size_chart_code
 *  since the 2.10 guide) — genuinely missing was just exposing them as
 *  optional list columns, not new schema. brand/gender/price were already
 *  filterable but not visible as columns either. */
type OptCol = "nameUk" | "brand" | "gender" | "price" | "salePrice" | "material" | "subtype"
  | "color" | "season" | "country" | "composition" | "sizeChartCode" | "moderation" | "description" | "descriptionUk" | "createdAt";

const money = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("uk-UA")} ₴`);
const MODERATION_LABEL: Record<string, string> = {
  draft: "Чернетка", pending: "На модерації", approved: "Підтверджено", rejected: "Не підтверджено", archived: "В архіві",
};

const OPT_COLS: { id: OptCol; label: string; hideDefault?: boolean; align?: "right"; render: (r: Row) => ReactNode }[] = [
  { id: "nameUk",        label: "Назва (укр.)",  hideDefault: true, render: (r) => r.name_uk || "—" },
  { id: "brand",         label: "Бренд",         hideDefault: true, render: (r) => r.brand || "—" },
  { id: "gender",        label: "Стать",         hideDefault: true, render: (r) => r.gender || "—" },
  { id: "price",         label: "Ціна",          hideDefault: true, align: "right", render: (r) => money(r.regular_price) },
  { id: "salePrice",     label: "Акційна ціна",  hideDefault: true, align: "right", render: (r) => money(r.sale_price) },
  { id: "material",      label: "Матеріал верху", hideDefault: true, render: (r) => r.material || "—" },
  { id: "subtype",       label: "Підвид",        hideDefault: true, render: (r) => r.subtype || "—" },
  { id: "color",         label: "Колір",         hideDefault: true, render: (r) => r.color || "—" },
  { id: "season",        label: "Сезон",         hideDefault: true, render: (r) => r.season || "—" },
  { id: "country",       label: "Країна",        hideDefault: true, render: (r) => r.country || "—" },
  { id: "composition",   label: "Склад",         hideDefault: true, render: (r) => r.composition || "—" },
  { id: "sizeChartCode", label: "Розмірна сітка", hideDefault: true, render: (r) => r.size_chart_code || "—" },
  { id: "moderation",    label: "Модерація",     hideDefault: true, render: (r) => MODERATION_LABEL[r.moderation_status ?? ""] ?? "—" },
  { id: "description",   label: "Опис (рос.)",   hideDefault: true, render: (r) => r.description || "—" },
  { id: "descriptionUk", label: "Опис (укр.)",   hideDefault: true, render: (r) => r.description_uk || "—" },
  { id: "createdAt",     label: "Створено",      hideDefault: true, render: (r) => r.created_at || "—" },
];

/* ── Read-only product list — a faithful 1:1 clone of the Intertop partner
      catalog list, core column order: ID товару · Назва (рос.) · Зображення ·
      Категорія · Код товару (mp+id) · Заводський артикул · Артикул (sku) ·
      Статус · Публікувався · Востаннє змінено, plus a «Колонки» chooser for
      the rest (OPT_COLS above). Shares the grid's filters, selection and
      paging; row-click opens the full card for editing. ──────── */
function ProductListView({
  rows, loading, total, page, perPage, setPage, setPerPage, totalPages,
  selected, toggleRow, toggleAll, onOpen,
}: {
  rows: Row[]; loading: boolean; total: number; page: number; perPage: number;
  setPage: (v: number | ((p: number) => number)) => void;
  setPerPage: (n: number) => void; totalPages: number;
  selected: Set<string>; toggleRow: (id: string) => void; toggleAll: () => void;
  onOpen: (id: string) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const [colsOpen, setColsOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<OptCol>>(() => new Set(OPT_COLS.filter((c) => c.hideDefault).map((c) => c.id)));
  const visibleCols = OPT_COLS.filter((c) => !hidden.has(c.id));

  // Compact page window: 1 … p-1 p p+1 … last
  const pages: (number | "…")[] = [];
  const win = new Set([1, totalPages, page, page - 1, page + 1].filter((n) => n >= 1 && n <= totalPages));
  let prev = 0;
  for (let n = 1; n <= totalPages; n++) {
    if (!win.has(n)) continue;
    if (prev && n - prev > 1) pages.push("…");
    pages.push(n); prev = n;
  }

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="relative">
          <button onClick={() => setColsOpen((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] px-3 text-[11px] uppercase tracking-[0.1em] text-[#5a6472] transition-colors hover:border-[#2f9488] hover:text-[#2f9488]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16M4 12h16M4 19h16M9 5v14" strokeLinecap="round" /></svg>
            Колонки
          </button>
          {colsOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-[5px] border border-[#e6eaec] bg-white p-2 shadow-lg">
                {OPT_COLS.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-[#2b2d42] hover:bg-[#f7f9fa]">
                    <input type="checkbox" checked={!hidden.has(c.id)}
                      onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                      className="h-3.5 w-3.5 accent-[#2f9488]" />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="w-10 border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити всі" />
              </th>
              <th className={thCls}>ID товару</th>
              <th className={thCls}>Назва (рос.)</th>
              <th className={thCls}>Зображення</th>
              <th className={thCls}>Категорія</th>
              <th className={thCls}>Код товару</th>
              <th className={thCls}>Заводський артикул</th>
              <th className={thCls}>SKU</th>
              <th className={thCls}>Статус</th>
              {visibleCols.map((c) => (
                <th key={c.id} className={c.align === "right" ? `${thCls} text-right` : thCls}>{c.label}</th>
              ))}
              <th className={`${thCls} text-center`}>Публікувався</th>
              <th className={thCls}>Востаннє змінено</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11 + visibleCols.length} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11 + visibleCols.length} className="px-3 py-12 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            ) : rows.map((row) => {
              const st = siteStatus(row);
              const isSel = selected.has(row.id);
              return (
                <tr key={row.id} onClick={() => onOpen(row.id)}
                  className={`cursor-pointer border-b border-[#eef2f3] transition-colors ${isSel ? "bg-[#eef7f6]" : "hover:bg-[#f7f9fa]"}`}>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleRow(row.id)}
                      className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити рядок" />
                  </td>
                  <td className="px-3 py-2.5 font-medium tabular-nums text-[#5a6472]">{row.id}</td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-[#2b2d42]" title={row.name}>{row.name}</td>
                  <td className="px-3 py-2">
                    {row.image_src
                      ? <img src={row.image_src} alt="" className="h-11 w-11 rounded-[4px] border border-[#e6eaec] object-cover" />
                      : <div className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-dashed border-[#d5dbe0] text-[#b6c0ca]">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm2 11l4-5 3 4 2-2 3 3M9 10a1 1 0 100-2 1 1 0 000 2z" /></svg>
                        </div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">{row.category || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{row.sku || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{row.factory_article || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{row.sku || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5" title={st.title}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                      <span className="text-[12px] text-[#3a4250]">{st.label}</span>
                    </span>
                  </td>
                  {visibleCols.map((c) => (
                    <td key={c.id} className={`max-w-[220px] truncate px-3 py-2.5 text-[#5a6472] ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[12px] font-medium ${row.status === "publish" ? "text-[#2f9488]" : "text-[#aab4bf]"}`}>
                      {row.status === "publish" ? "Так" : "Ні"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-[#8a94a0]">{row.updated_at ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Intertop-style pagination footer */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-[12px] text-[#5a6472]">
        <label className="flex items-center gap-2">
          Показувати на сторінці
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
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
    </div>
  );
}

// ── Danger zone: wipe the entire catalog ─────────────────────────────────────
const WIPE_PHRASE = "ВИДАЛИТИ ВСЕ";

function WipeAllDialog({ onClose, total, onDone }: { onClose: () => void; total: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  async function run() {
    setStatus("running"); setError("");
    try {
      const r = await fetch("/api/admin/products/wipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: text }),
      });
      const d = await r.json();
      if (!r.ok) { setStatus("error"); setError(d.error ?? "Помилка"); return; }
      onDone();
      onClose();
    } catch {
      setStatus("error"); setError("Помилка мережі");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[110] w-[480px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-white shadow-2xl">
        <div className="border-b border-red-200 bg-red-50 px-5 py-4">
          <p className="text-[14px] font-medium text-red-800">Видалити весь каталог</p>
          <p className="mt-0.5 text-[12px] text-red-700">Незворотна дія — видаляє всі {total.toLocaleString("uk-UA")} товарів із бази.</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-[12px] leading-relaxed text-[#5a6472]">
            Перед видаленням система автоматично зробить свіжу резервну копію бази. Якщо бекап не вдасться —
            видалення НЕ відбудеться. Замовлення, клієнти й аналітика не постраждають — очищується лише каталог товарів.
          </p>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a94a0]">
              Введіть <b className="text-red-700">{WIPE_PHRASE}</b> для підтвердження
            </span>
            <input value={text} onChange={(e) => setText(e.target.value)} autoFocus
              className="mt-1.5 h-10 w-full rounded-[3px] border border-[#e6eaec] px-3 text-[13px] focus:border-red-500 focus:outline-none" />
          </label>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#eef2f3] px-5 py-3.5">
          <button onClick={onClose} className="h-9 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0] hover:text-[#2b2d42]">Скасувати</button>
          <button onClick={run} disabled={text !== WIPE_PHRASE || status === "running"}
            className="h-9 rounded-[3px] bg-red-600 px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-90 disabled:opacity-40">
            {status === "running" ? "Видаляємо…" : "Видалити все"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Export settings dialog ───────────────────────────────────────────────────
function ExportDialog({
  onClose, scope, setScope, format, setFormat, cols, setCols,
  total, filteredHint, selectedCount, pageCount, onExport,
}: {
  onClose: () => void;
  scope: "all" | "filtered" | "selected" | "page";
  setScope: (s: "all" | "filtered" | "selected" | "page") => void;
  format: string; setFormat: (f: string) => void;
  cols: Set<string>; setCols: (s: Set<string>) => void;
  total: number; filteredHint: boolean; selectedCount: number; pageCount: number;
  onExport: () => void;
}) {
  const scopes: { id: typeof scope; label: string; hint: string; disabled?: boolean }[] = [
    { id: "all", label: "Весь каталог", hint: "усі товари в базі" },
    { id: "filtered", label: "Поточний фільтр", hint: filteredHint ? `${total} за фільтром` : `усі ${total}` },
    { id: "selected", label: "Вибрані", hint: `${selectedCount} обрано`, disabled: selectedCount === 0 },
    { id: "page", label: "Поточна сторінка", hint: `${pageCount} рядків` },
  ];
  const formats = [
    { id: "xlsx", label: "Excel (.xlsx)" },
    { id: "csv", label: "CSV (.csv)" },
    { id: "json", label: "JSON (.json)" },
    { id: "pdf", label: "PDF (друк)" },
  ];
  function toggleCol(c: string) {
    const n = new Set(cols);
    n.has(c) ? n.delete(c) : n.add(c);
    setCols(n);
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[6px] border border-[#e6eaec] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-[#2b2d42]">Експорт каталогу</h3>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]" aria-label="Закрити">✕</button>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Що експортувати</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {scopes.map((s) => (
            <button key={s.id} disabled={s.disabled} onClick={() => setScope(s.id)}
              className={`rounded-[4px] border px-3 py-2 text-left text-[12px] disabled:opacity-40 ${
                scope === s.id ? "border-[#2b2d42] bg-[#f7f9fa]" : "border-[#e6eaec] hover:border-[#b6c0ca]"
              }`}>
              <span className="block font-medium text-[#2b2d42]">{s.label}</span>
              <span className="text-[11px] text-[#8a94a0]">{s.hint}</span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Формат</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {formats.map((f) => (
            <button key={f.id} onClick={() => setFormat(f.id)}
              className={`rounded-[4px] border px-3 py-1.5 text-[12px] ${
                format === f.id ? "border-[#2b2d42] bg-[#f7f9fa] text-[#2b2d42]" : "border-[#e6eaec] text-[#5a6472] hover:border-[#b6c0ca]"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a94a0]">Стовпці ({cols.size})</p>
          <div className="flex gap-2 text-[11px]">
            <button onClick={() => setCols(new Set(EXPORT_COLUMNS))} className="text-[#2b2d42] hover:underline">Усі</button>
            <button onClick={() => setCols(new Set())} className="text-[#8a94a0] hover:underline">Зняти</button>
          </div>
        </div>
        <div className="mb-5 grid max-h-44 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-3">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[12px] text-[#2b2d42]">
              <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} />
              {c}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-[4px] border border-[#e6eaec] px-4 py-2 text-[12px] text-[#5a6472] hover:border-[#2b2d42]">Скасувати</button>
          <button onClick={onExport} disabled={cols.size === 0}
            className="rounded-[4px] border border-[#2f9488] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            Експортувати
          </button>
        </div>
      </div>
    </div>
  );
}
