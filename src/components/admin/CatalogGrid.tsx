"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminProducts } from "./AdminProducts";

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

  function openFullNew() { setCardsInitial({ kind: "new" }); setMode("cards"); }
  function openFullCard(id: string) { setCardsInitial({ kind: "edit", id }); setMode("cards"); }

  const dirtyCount = Object.keys(edits).length;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      perPage: String(perPage),
      sortBy,
      sortDir,
    });
    if (search) params.set("q", search);
    if (stock) params.set("stock", stock);
    if (brand) params.set("brand", brand);
    const res = await fetch(`/api/admin/products?${params}`);
    const data = await res.json();
    setRows(data.products ?? []);
    setTotal(data.total ?? 0);
    setSelected(new Set());
    setEdits({});
    setLoading(false);
  }, [page, perPage, sortBy, sortDir, search, stock, brand]);

  useEffect(() => { if (mode === "grid") load(); }, [load, mode]);

  useEffect(() => {
    fetch("/api/admin/products/price-rule")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
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
  function exportUrl(format: string) {
    const params = new URLSearchParams({ format });
    if (search) params.set("q", search);
    if (stock) params.set("stock", stock);
    if (brand) params.set("brand", brand);
    if (selected.size) params.set("ids", [...selected].join(","));
    return `/api/admin/products/export?${params}`;
  }
  function download(format: string) {
    const a = document.createElement("a");
    a.href = exportUrl(format);
    a.click();
    setExportOpen(false);
  }
  function printPdf() {
    const subset = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const head = ["Артикул", "Назва", "Бренд", "Категорія", "Ціна", "Акція", "Колір", "Розміри", "Наявн."];
    const body = subset
      .map((r) => `<tr><td>${esc(r.sku)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.category)}</td><td>${esc(r.regular_price)}</td><td>${esc(r.sale_price ?? "")}</td><td>${esc(r.color)}</td><td>${esc(r.sizes)}</td><td>${r.is_in_stock ? "Так" : "Ні"}</td></tr>`)
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
      <p>${subset.length} позицій · ${new Date().toLocaleString("uk-UA")}</p>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    setExportOpen(false);
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
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
          className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[12px] text-[#17130f] focus:border-[#17130f] focus:outline-none">
          {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}/стор.</option>)}
        </select>

        {/* Export dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-[11px] uppercase tracking-[0.1em] text-[#17130f] transition-colors hover:border-[#17130f]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Експорт{selected.size ? ` (${selected.size})` : ""}
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-[4px] border border-[#e8e4de] bg-white py-1 shadow-lg">
                {[
                  { fmt: "xlsx", label: "Excel (.xlsx)", fn: () => download("xlsx") },
                  { fmt: "csv", label: "CSV (.csv)", fn: () => download("csv") },
                  { fmt: "pdf", label: "PDF (друк)", fn: printPdf },
                  { fmt: "json", label: "JSON (.json)", fn: () => download("json") },
                ].map((o) => (
                  <button key={o.fmt} onClick={o.fn}
                    className="block w-full px-3 py-2 text-left text-[12px] text-[#17130f] hover:bg-[#f7f5f2]">
                    {o.label}
                  </button>
                ))}
                <p className="border-t border-[#f0ece6] px-3 pb-1 pt-1.5 text-[10px] text-[#9c8f7d]">
                  {selected.size ? `${selected.size} обраних` : `усі за фільтром (${total})`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

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
                    <button onClick={() => openFullCard(row.id)}
                      className="rounded-[3px] border border-[#e8e4de] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[#17130f] transition-colors hover:border-[#17130f]">
                      Картка
                    </button>
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
