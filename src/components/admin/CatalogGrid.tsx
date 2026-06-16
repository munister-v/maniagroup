"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminProducts } from "./AdminProducts";
import { SocialPostButton } from "./AiAssistant";

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
  sizes: string;
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
  { key: "name", label: "Назва", type: "text", w: 260, sortable: true },
  { key: "brand", label: "Бренд", type: "text", w: 150, sortable: true },
  { key: "sku", label: "Артикул", type: "text", w: 110, sortable: true },
  { key: "category", label: "Категорія", type: "text", w: 140, sortable: true },
  { key: "gender", label: "Стать", type: "gender", w: 100 },
  { key: "regular_price", label: "Ціна", type: "number", w: 90, sortable: true },
  { key: "sale_price", label: "Акція", type: "number", w: 90, sortable: true },
  { key: "color", label: "Колір", type: "text", w: 120, sortable: true },
  { key: "season", label: "Сезон", type: "text", w: 110, sortable: true },
  { key: "composition", label: "Склад", type: "text", w: 170 },
  { key: "sizes", label: "Розміри", type: "text", w: 130 },
  { key: "is_in_stock", label: "Наявн.", type: "bool", w: 70, sortable: true },
  { key: "status", label: "Статус", type: "status", w: 120, sortable: true },
  { key: "featured", label: "Обр.", type: "bool", w: 60 },
];

const PER_PAGE_OPTIONS = [50, 100, 200];

// Export column names — must match the server's localized headers (export route).
const EXPORT_COLUMNS = [
  "ID", "Артикул", "Назва", "Бренд", "Категорія", "Стать", "Ціна", "Акційна",
  "Підсумкова", "В наявності", "Статус", "Колір", "Сезон", "Склад", "Країна",
  "Розміри", "Slug", "Фото",
];

export function CatalogGrid({ onToast, onImport }: { onToast?: (m: string) => void; onImport?: () => void }) {
  const [mode, setMode] = useState<"grid" | "cards">("grid");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("");
  const [brand, setBrand] = useState("");
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [perPage, setPerPage] = useState(50);
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, Partial<Record<Field, CellValue>>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [cardsInitial, setCardsInitial] = useState<{ kind: "new" } | { kind: "edit"; id: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extended filters + facets
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [color, setColor] = useState("");
  const [season, setSeason] = useState("");
  const [statusF, setStatusF] = useState("");
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
    if (minPrice) p.set("minPrice", minPrice);
    if (maxPrice) p.set("maxPrice", maxPrice);
    return p;
  }, [search, stock, brand, category, gender, color, season, statusF, minPrice, maxPrice]);

  const activeFilters = [stock, brand, category, gender, color, season, statusF, minPrice, maxPrice].filter(Boolean).length;
  function resetFilters() {
    setStock(""); setBrand(""); setCategory(""); setGender(""); setColor("");
    setSeason(""); setStatusF(""); setMinPrice(""); setMaxPrice(""); setPage(1);
  }

  function openFullNew() { setCardsInitial({ kind: "new" }); setMode("cards"); }
  function openFullCard(id: string) { setCardsInitial({ kind: "edit", id }); setMode("cards"); }

  const dirtyCount = Object.keys(edits).length;

  const load = useCallback(async () => {
    const params = filterParams();
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    const res = await fetch(`/api/admin/products?${params}`);
    const data = await res.json();
    setRows(data.products ?? []);
    setTotal(data.total ?? 0);
    setSelected(new Set());
    setEdits({});
    setLoading(false);
  }, [page, perPage, sortBy, sortDir, filterParams]);

  useEffect(() => { if (mode === "grid") load(); }, [load, mode]);

  useEffect(() => {
    fetch("/api/admin/products/price-rule")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
      .catch(() => {});
    fetch("/api/admin/products/facets")
      .then((r) => r.json())
      .then((d) => setFacets({ categories: d.categories ?? [], colors: d.colors ?? [], seasons: d.seasons ?? [] }))
      .catch(() => {});
  }, []);

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
          else if (k === "sizes") out["sizes"] = String(v).split(",").map((s) => s.trim()).filter(Boolean);
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

  // ── Bulk row actions ─────────────────────────────────────────────────────
  async function bulk(action: string) {
    if (selected.size === 0) return;
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    if (res.ok) { onToast?.("Готово"); await load(); }
  }

  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
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
        body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#17130f;padding:24px}
        h1{font-size:18px;margin:0 0 4px} p{color:#888;font-size:12px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
        th{background:#f3f0ea;text-transform:uppercase;font-size:9px;letter-spacing:.04em}
        tr:nth-child(even){background:#faf8f5}
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
        <ModeToggle mode={mode} setMode={(m) => { if (m === "cards") setCardsInitial(null); setMode(m); }} onImport={onImport} onNew={openFullNew} />
        <AdminProducts onToast={onToast} initialOpen={cardsInitial} />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const inp = "h-7 w-full bg-transparent px-1.5 text-[12px] text-[#17130f] outline-none focus:bg-[#fffdf8] focus:ring-1 focus:ring-[#17130f]/30";

  return (
    <div className="flex flex-col">
      <ModeToggle mode={mode} setMode={(m) => { if (m === "cards") setCardsInitial(null); setMode(m); }} onImport={onImport} onNew={openFullNew} />

      {/* Intro / how-to */}
      <div className="mb-3 flex items-start gap-3 rounded-[4px] border border-[#e8e4de] bg-[#faf8f5] px-3.5 py-2.5">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[#9c8f7d]" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
        <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-[#6b6253]">
          <b className="text-[#17130f]">Таблиця</b> — швидке редагування: клікніть будь-яку клітинку (ціна, наявність, статус…), змініть і натисніть <b>«Зберегти всі»</b>.
          {" "}Кнопка <b>«Картка»</b> у рядку відкриє повну картку товару з фото та описом.
          {" "}<b>«Картки + фото»</b> — режим з великими зображеннями. <b>«Імпорт XLS»</b> — масове оновлення каталогу з файлу.
          {helpOpen && (
            <span className="mt-1 block text-[#9c8f7d]">
              Фільтри (пошук / наявність / бренд) і сортування за стовпцями звужують список; експорт і масові дії (опублікувати, в обране, видалити) працюють із обраними рядками або з усім списком за фільтром.
            </span>
          )}
        </div>
        <button onClick={() => setHelpOpen((v) => !v)} className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">
          {helpOpen ? "Згорнути" : "Докладніше"}
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Пошук: назва, бренд, артикул…"
          className="h-9 w-56 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-[13px] text-[#17130f] focus:border-[#17130f] focus:outline-none"
        />
        <select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Усі</option>
          <option value="in">В наявності</option>
          <option value="out">Немає</option>
        </select>
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}
          className="h-9 max-w-44 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Усі бренди</option>
          {brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="h-9 max-w-44 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Усі категорії</option>
          {facets.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>)}
        </select>
        <select value={gender} onChange={(e) => { setGender(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Стать</option>
          <option value="women">Жіноче</option>
          <option value="men">Чоловіче</option>
        </select>
        <select value={color} onChange={(e) => { setColor(e.target.value); setPage(1); }}
          className="h-9 max-w-36 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Колір</option>
          {facets.colors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={season} onChange={(e) => { setSeason(e.target.value); setPage(1); }}
          className="h-9 max-w-36 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Сезон</option>
          {facets.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          <option value="">Статус</option>
          <option value="publish">Опубліковані</option>
          <option value="draft">Чернетки</option>
        </select>
        <input value={minPrice} onChange={(e) => { setMinPrice(e.target.value.replace(/\D/g, "")); setPage(1); }}
          placeholder="₴ від" inputMode="numeric"
          className="h-9 w-20 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none" />
        <input value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value.replace(/\D/g, "")); setPage(1); }}
          placeholder="₴ до" inputMode="numeric"
          className="h-9 w-20 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none" />
        {activeFilters > 0 && (
          <button onClick={resetFilters}
            className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f]">
            Скинути ({activeFilters})
          </button>
        )}
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}/стор.</option>)}
        </select>

        {/* Export — opens settings dialog */}
        <button
          onClick={() => { setExportScope(selected.size ? "selected" : "filtered"); setExportOpen(true); }}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#17130f] transition-colors hover:border-[#17130f]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Експорт{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>

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

      {/* Sticky save bar when dirty */}
      {dirtyCount > 0 && (
        <div className="sticky top-0 z-30 mb-2 flex items-center gap-3 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2">
          <span className="text-[12px] text-amber-800">Незбережені зміни: <b>{dirtyCount}</b> товарів</span>
          <button onClick={saveEdits} disabled={saving}
            className="ml-auto h-8 rounded-[3px] bg-[#17130f] px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">
            {saving ? "Зберігаємо…" : "Зберегти всі"}
          </button>
          <button onClick={discardEdits} className="text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">Скасувати</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#e8e4de] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.1em]">
          <span className="text-[#9c8f7d]">Обрано {selected.size}</span>
          {[
            { a: "publish", l: "Опублікувати" }, { a: "unpublish", l: "Сховати" },
            { a: "in_stock", l: "В наявн." }, { a: "out_of_stock", l: "Немає" },
            { a: "feature", l: "В обране" }, { a: "unfeature", l: "З обраного" },
          ].map((b) => (
            <button key={b.a} onClick={() => bulk(b.a)} className="text-[#17130f] underline-offset-2 hover:underline">{b.l}</button>
          ))}
          <button onClick={() => { if (confirm(`Видалити ${selected.size} товарів?`)) bulk("delete"); }}
            className="text-red-600 underline-offset-2 hover:underline">Видалити</button>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-[4px] border border-[#e8e4de] bg-white">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#f7f5f2]">
            <tr className="border-b border-[#e8e4de]">
              <th className="w-9 px-2 py-2">
                <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="h-3.5 w-3.5" />
              </th>
              <th className="w-12 px-1 py-2" />
              {COLS.map((c) => (
                <th key={c.key} style={{ minWidth: c.w }}
                  className="px-2 py-2 text-left text-[10px] uppercase tracking-[0.06em] text-[#9c8f7d]">
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 hover:text-[#17130f]">
                      {c.label}
                      {sortBy === c.key && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={COLS.length + 3} className="px-3 py-10 text-center text-[#9c8f7d]">Завантаження…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={COLS.length + 3} className="px-3 py-10 text-center text-[#9c8f7d]">Нічого не знайдено</td></tr>
            )}
            {!loading && rows.map((row) => {
              const rowDirty = !!edits[row.id];
              return (
                <tr key={row.id} className={`border-b border-[#f0ece6] ${rowDirty ? "bg-amber-50/40" : "hover:bg-[#faf8f5]"}`}>
                  <td className="px-2 py-1 align-middle">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="h-3.5 w-3.5" />
                  </td>
                  <td className="px-1 py-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {row.image_src
                      ? <img src={row.image_src} alt="" className="h-9 w-9 rounded-[2px] object-cover" />
                      : <div className="h-9 w-9 rounded-[2px] bg-[#f0ece6]" />}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-1 py-0.5 align-middle">
                      {c.type === "bool" ? (
                        <input type="checkbox" checked={Boolean(cell(row, c.key))}
                          onChange={(e) => setCell(row.id, c.key, e.target.checked)} className="ml-1.5 h-3.5 w-3.5" />
                      ) : c.type === "gender" ? (
                        <select value={String(cell(row, c.key) ?? "")} onChange={(e) => setCell(row.id, c.key, e.target.value)} className={inp}>
                          <option value="">—</option>
                          <option value="men">Чол.</option>
                          <option value="women">Жін.</option>
                        </select>
                      ) : c.type === "status" ? (
                        <select value={String(cell(row, c.key) ?? "")} onChange={(e) => setCell(row.id, c.key, e.target.value)} className={inp}>
                          <option value="publish">Опубл.</option>
                          <option value="draft">Чернетка</option>
                        </select>
                      ) : (
                        <input
                          type={c.type === "number" ? "number" : "text"}
                          value={(cell(row, c.key) ?? "") as string | number}
                          onChange={(e) => setCell(row.id, c.key, e.target.value)}
                          className={inp}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-0.5 text-right align-middle">
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
                      <button onClick={() => openFullCard(row.id)}
                        className="rounded-[3px] border border-[#e8e4de] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#17130f] transition-colors hover:border-[#17130f]">
                        Картка
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} товарів · стор. {page} з {totalPages}</span>
        <div className="flex gap-1.5">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="h-8 rounded-[3px] border border-[#e8e4de] px-3 text-[12px] text-[#17130f] disabled:opacity-30 hover:enabled:border-[#17130f]">‹</button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="h-8 rounded-[3px] border border-[#e8e4de] px-3 text-[12px] text-[#17130f] disabled:opacity-30 hover:enabled:border-[#17130f]">›</button>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({ mode, setMode, onImport, onNew }: { mode: "grid" | "cards"; setMode: (m: "grid" | "cards") => void; onImport?: () => void; onNew?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-[3px] border border-[#e8e4de] p-0.5">
        <button onClick={() => setMode("grid")}
          className={`h-8 rounded-[2px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${mode === "grid" ? "bg-[#17130f] text-white" : "text-[#9c8f7d] hover:text-[#17130f]"}`}>
          Таблиця
        </button>
        <button onClick={() => setMode("cards")}
          className={`h-8 rounded-[2px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${mode === "cards" ? "bg-[#17130f] text-white" : "text-[#9c8f7d] hover:text-[#17130f]"}`}>
          Картки + фото
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {onNew && (
          <button onClick={onNew}
            className="flex h-8 items-center gap-1.5 rounded-[3px] bg-[#17130f] px-3 text-[11px] uppercase tracking-[0.1em] text-white transition-opacity hover:opacity-85">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            Новий товар
          </button>
        )}
        {onImport && (
          <button onClick={onImport}
            className="flex h-8 items-center gap-1.5 rounded-[3px] border border-[#e8e4de] px-3 text-[11px] uppercase tracking-[0.1em] text-[#17130f] transition-colors hover:border-[#17130f]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 15V3m0 0L8 7m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Імпорт XLS
          </button>
        )}
      </div>
    </div>
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
      <div className="relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[6px] border border-[#e8e4de] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-medium text-[#17130f]">Експорт каталогу</h3>
          <button onClick={onClose} className="text-[#9c8f7d] hover:text-[#17130f]" aria-label="Закрити">✕</button>
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d]">Що експортувати</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {scopes.map((s) => (
            <button key={s.id} disabled={s.disabled} onClick={() => setScope(s.id)}
              className={`rounded-[4px] border px-3 py-2 text-left text-[12px] disabled:opacity-40 ${
                scope === s.id ? "border-[#17130f] bg-[#faf8f5]" : "border-[#e8e4de] hover:border-[#c9bdab]"
              }`}>
              <span className="block font-medium text-[#17130f]">{s.label}</span>
              <span className="text-[11px] text-[#9c8f7d]">{s.hint}</span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d]">Формат</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {formats.map((f) => (
            <button key={f.id} onClick={() => setFormat(f.id)}
              className={`rounded-[4px] border px-3 py-1.5 text-[12px] ${
                format === f.id ? "border-[#17130f] bg-[#faf8f5] text-[#17130f]" : "border-[#e8e4de] text-[#6b6253] hover:border-[#c9bdab]"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d]">Стовпці ({cols.size})</p>
          <div className="flex gap-2 text-[11px]">
            <button onClick={() => setCols(new Set(EXPORT_COLUMNS))} className="text-[#17130f] hover:underline">Усі</button>
            <button onClick={() => setCols(new Set())} className="text-[#9c8f7d] hover:underline">Зняти</button>
          </div>
        </div>
        <div className="mb-5 grid max-h-44 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto sm:grid-cols-3">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-[12px] text-[#17130f]">
              <input type="checkbox" checked={cols.has(c)} onChange={() => toggleCol(c)} />
              {c}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-[4px] border border-[#e8e4de] px-4 py-2 text-[12px] text-[#6b6253] hover:border-[#17130f]">Скасувати</button>
          <button onClick={onExport} disabled={cols.size === 0}
            className="rounded-[4px] bg-[#17130f] px-5 py-2 text-[12px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">
            Експортувати
          </button>
        </div>
      </div>
    </div>
  );
}
