"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice, PRODUCT_CATEGORIES } from "@/lib/catalog";
import { DetailCard, SubTabs } from "./intertop/primitives";

type Row = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string;
  category: string;
  category_slug: string;
  gender: string;
  regular_price: number;
  sale_price: number | null;
  price: number;
  is_in_stock: boolean;
  status: string;
  image_src: string;
  featured?: boolean;
};

type FullProduct = Row & {
  factory_article?: string;
  images: { src: string }[];
  attributes: { taxonomy: string; terms: { name: string; slug: string }[] }[];
  variants?: { size: string; stock_qty: number }[];
  /** name/description = «Мова Російська» (current real content); name_uk/
   *  description_uk = «Мова Українська» (Intertop 2.1) — see lib/pg.ts. */
  name_uk?: string;
  description_uk?: string;
  description: string;
  short_description: string;
  color: string;
  country: string;
  season: string;
  collection: string;
  composition: string;
  /** "Матеріал верху" / "Підвид" — see products.ts / lib/classifierTree.ts. */
  material: string;
  subtype: string;
  /** Intertop 2.1 moderation workflow — draft | pending | approved | rejected. */
  moderation_status: string;
  created_at: string;
  updated_at: string;
};

/** «Загальні дані» status pill — composes moderation_status with the real
 *  publish/stock state, matching Intertop's Чернетка/На модерації/
 *  Не підтверджено/Підтверджено/На сайті vocabulary. */
function moderationLabel(p: { moderation_status: string; status: string; is_in_stock: boolean }): { label: string; color: string } {
  switch (p.moderation_status) {
    case "pending": return { label: "На модерації", color: "#d97706" };
    case "rejected": return { label: "Не підтверджено", color: "#e5484d" };
    case "approved": return p.status === "publish" && p.is_in_stock
      ? { label: "На сайті", color: "#2f9488" }
      : { label: "Підтверджено", color: "#2f9488" };
    default: return { label: "Чернетка", color: "#8a94a0" };
  }
}

type SizeRow = { size: string; qty: string };

type Draft = {
  name: string;
  name_uk: string;
  description_uk: string;
  brand: string;
  sku: string;
  factory_article: string;
  category: string;
  category_slug: string;
  gender: string;
  regular_price: string;
  sale_price: string;
  is_in_stock: boolean;
  status: string;
  images: string[];
  sizes: SizeRow[];
  color: string;
  composition: string;
  season: string;
  country: string;
  material: string;
  subtype: string;
  short_description: string;
  description: string;
};

// New products start life as Чернетка (Intertop 2.1: every product goes
// through На модерацію → Підтверджено before it can reach the site) —
// status defaults to "draft" here, not "publish".
const EMPTY_DRAFT: Draft = {
  name: "", name_uk: "", description_uk: "", brand: "", sku: "", factory_article: "", category: "", category_slug: "", gender: "",
  regular_price: "", sale_price: "", is_in_stock: true, status: "draft",
  images: [], sizes: [], color: "", composition: "", season: "", country: "",
  material: "", subtype: "",
  short_description: "", description: "",
};

const PER_PAGE = 30;

const STOCK_TABS = [
  { value: "", label: "Всі" },
  { value: "in", label: "В наявності" },
  { value: "out", label: "Немає" },
] as const;

function draftFromProduct(p: FullProduct): Draft {
  // Real per-size stock (product_variants) wins; fall back to the cosmetic
  // attributes JSON with qty=0 for products that pre-date variant tracking.
  const sizes: SizeRow[] = p.variants?.length
    ? p.variants.map((v) => ({ size: v.size, qty: String(v.stock_qty) }))
    : (p.attributes?.find((a) => a.taxonomy === "pa_size")?.terms ?? []).map((t) => ({ size: t.name, qty: "0" }));
  const images = (p.images ?? []).map((i) => i.src).filter(Boolean);
  if (images.length === 0 && p.image_src) images.push(p.image_src);
  return {
    name: p.name, name_uk: p.name_uk ?? "", description_uk: p.description_uk ?? "",
    brand: p.brand, sku: p.sku, factory_article: p.factory_article ?? "", category: p.category, category_slug: p.category_slug ?? "", gender: p.gender,
    regular_price: String(p.regular_price ?? ""), sale_price: p.sale_price ? String(p.sale_price) : "",
    is_in_stock: p.is_in_stock, status: p.status, images,
    sizes, color: p.color ?? "", composition: p.composition ?? "", season: p.season ?? "",
    country: p.country ?? "", material: p.material ?? "", subtype: p.subtype ?? "",
    short_description: p.short_description ?? "", description: p.description ?? "",
  };
}

function draftToPayload(d: Draft) {
  return {
    name: d.name.trim(),
    name_uk: d.name_uk.trim(),
    description_uk: d.description_uk,
    brand: d.brand.trim() || "Mania Group",
    sku: d.sku.trim(),
    factory_article: d.factory_article.trim(),
    category: d.category.trim() || "Одяг",
    category_slug: d.category_slug,
    gender: d.gender,
    regular_price: Number(d.regular_price) || 0,
    sale_price: d.sale_price ? Number(d.sale_price) : null,
    is_in_stock: d.is_in_stock,
    status: d.status,
    image_src: d.images[0] ?? "",
    images: d.images.map((src) => ({ src })),
    sizes: d.sizes.filter((s) => s.size.trim()).map((s) => ({ size: s.size.trim(), qty: Number(s.qty) || 0 })),
    color: d.color.trim(),
    composition: d.composition.trim(),
    season: d.season.trim(),
    country: d.country.trim(),
    material: d.material.trim(),
    subtype: d.subtype.trim(),
    short_description: d.short_description,
    description: d.description,
  };
}

export function AdminProducts({ onToast, initialOpen }: {
  onToast?: (msg: string) => void;
  initialOpen?: { kind: "new" } | { kind: "edit"; id: string } | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorId, setEditorId] = useState<string | "new" | null>(null);
  const [productTab, setProductTab] = useState<"product" | "offers" | "history">("product");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Full loaded product — carries moderation_status/created_at/updated_at for
  // the «Загальні дані» header card, which the editable `draft` doesn't need.
  const [current, setCurrent] = useState<FullProduct | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showRule, setShowRule] = useState(false);
  const [ruleBrands, setRuleBrands] = useState<{ brand: string; count: number }[]>([]);
  const [rule, setRule] = useState({ scope: "", percent: "" });
  const [ruleBusy, setRuleBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function openPriceRule() {
    setShowRule((v) => !v);
    if (ruleBrands.length === 0) {
      const res = await fetch("/api/admin/products/price-rule");
      if (res.ok) setRuleBrands((await res.json()).brands ?? []);
    }
  }

  async function applyRule(clear: boolean) {
    if (!rule.scope) { onToast?.("Оберіть бренд"); return; }
    if (!clear && !Number(rule.percent)) { onToast?.("Вкажіть відсоток"); return; }
    setRuleBusy(true);
    try {
      const res = await fetch("/api/admin/products/price-rule", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: { brand: rule.scope }, percent: clear ? 0 : Number(rule.percent) }),
      });
      const data = await res.json();
      if (res.ok) { onToast?.(clear ? `Знижку знято з ${data.count} тов.` : `Знижку застосовано до ${data.count} тов.`); load(1, search, stock); }
      else onToast?.(data.error ?? "Помилка");
    } finally { setRuleBusy(false); }
  }

  const load = useCallback(async (p: number, q: string, st: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q.trim()) params.set("q", q.trim());
      if (st) params.set("stock", st);
      const res = await fetch(`/api/admin/products?${params}`);
      const data = await res.json();
      setRows(data.products ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, search, stock); /* eslint-disable-next-line */ }, [stock]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1, v, stock), 350);
  }

  async function openEdit(id: string) {
    setError("");
    const res = await fetch(`/api/admin/products/${id}`);
    if (!res.ok) return;
    const p = (await res.json()) as FullProduct;
    setDraft(draftFromProduct(p));
    setCurrent(p);
    setProductTab("product");
    setEditorId(id);
  }

  function openNew() {
    setError("");
    setDraft(EMPTY_DRAFT);
    setCurrent(null);
    setProductTab("product");
    setEditorId("new");
  }

  /** Moderation-workflow transition (Intertop 2.1: Чернетка/На модерації/
   *  Підтверджено/Не підтверджено). `label` becomes the «Історія статусів»
   *  entry text, e.g. "Чернетка → На модерації". */
  async function transition(patch: { moderation_status: string; status?: string }, label: string) {
    if (!current) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/admin/products/${current.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, statusTransitionLabel: label }),
      });
      if (res.ok) {
        onToast?.(label);
        await openEdit(current.id);
        load(page, search, stock);
      } else {
        const data = await res.json();
        onToast?.(data.error ?? "Помилка");
      }
    } finally {
      setTransitioning(false);
    }
  }

  async function duplicateCurrent() {
    if (!current) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/admin/products/${current.id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        onToast?.(`Товар скопійовано → #${data.id}`);
        load(page, search, stock);
        await openEdit(data.id);
      } else {
        onToast?.(data.error ?? "Помилка копіювання");
      }
    } finally {
      setTransitioning(false);
    }
  }

  async function removeCurrent() {
    if (!current) return;
    if (!confirm(`Видалити «${current.name}»? Цю дію не можна скасувати.`)) return;
    const res = await fetch(`/api/admin/products/${current.id}`, { method: "DELETE" });
    if (res.ok) {
      onToast?.("Товар видалено");
      setEditorId(null);
      load(page, search, stock);
    }
  }

  // Open a product (or the new-product form) immediately when asked to by a parent
  // — e.g. clicking "Повна картка" on a row in the catalog grid.
  useEffect(() => {
    if (!initialOpen) return;
    if (initialOpen.kind === "new") openNew();
    else openEdit(initialOpen.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  async function save() {
    if (!draft.name.trim() || !draft.regular_price) { setError("Вкажіть назву та ціну"); return; }
    setSaving(true); setError("");
    const payload = draftToPayload(draft);
    const res =
      editorId === "new"
        ? await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/admin/products/${editorId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка збереження"); return; }
    setEditorId(null);
    onToast?.(editorId === "new" ? "Товар створено" : "Зміни збережено");
    load(page, search, stock);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Видалити «${name}»? Цю дію не можна скасувати.`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (res.ok) { onToast?.("Товар видалено"); load(page, search, stock); }
  }

  async function bulk(action: string, label: string) {
    if (selected.size === 0) return;
    if (action === "delete" && !confirm(`Видалити ${selected.size} товар(ів)? Незворотно.`)) return;
    const res = await fetch("/api/admin/products/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    const data = await res.json();
    if (res.ok) { onToast?.(`${label}: ${data.count}`); load(page, search, stock); }
    else onToast?.(data.error ?? "Помилка");
  }

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const inp = "h-10 w-full border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none";
  const lbl = "text-[10px] uppercase tracking-wider text-[#8a94a0]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#2b2d42]">Товари</h2>
          <p className="text-[12px] text-[#8a94a0]">{total.toLocaleString("uk-UA")} у каталозі</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Назва, бренд, SKU…"
            className="h-10 w-64 border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
          <button onClick={openPriceRule} className="h-10 shrink-0 border border-[#e6eaec] bg-white px-4 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
            Знижки
          </button>
          <button onClick={openNew} className="h-10 shrink-0 border border-[#2f9488] px-5 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
            + Додати
          </button>
        </div>
      </div>

      {showRule && (
        <div className="mb-4 rounded-[3px] border border-[#e6eaec] bg-[#f7f9fa] p-4">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-[#8a94a0]">Масова знижка на бренд</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className={lbl}>Бренд</span>
              <select value={rule.scope} onChange={(e) => setRule({ ...rule, scope: e.target.value })}
                className="h-10 border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none">
                <option value="">— оберіть —</option>
                {ruleBrands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={lbl}>Знижка, %</span>
              <input type="number" min="0" max="95" value={rule.percent} onChange={(e) => setRule({ ...rule, percent: e.target.value })}
                placeholder="20" className="h-10 w-24 border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
            </label>
            <button onClick={() => applyRule(false)} disabled={ruleBusy}
              className="h-10 border border-[#2f9488] px-5 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
              {ruleBusy ? "…" : "Застосувати"}
            </button>
            <button onClick={() => applyRule(true)} disabled={ruleBusy}
              className="h-10 border border-[#e6eaec] bg-white px-4 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]">
              Зняти знижку
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#8a94a0]">Встановлює акційну ціну = звичайна × (1 − %). «Зняти знижку» повертає звичайну ціну.</p>
        </div>
      )}

      {/* Stock filter tabs */}
      <div className="mb-4 flex gap-1.5">
        {STOCK_TABS.map((t) => (
          <button key={t.value} onClick={() => setStock(t.value)}
            className={`h-8 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              stock === t.value ? "bg-[#2f9488] text-white" : "border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[3px] border border-[#2b2d42] bg-[#2b2d42] px-3 py-2 text-white">
          <span className="text-[12px]">Обрано: {selected.size}</span>
          <span className="mx-1 h-4 w-px bg-white/20" />
          <BulkBtn onClick={() => bulk("publish", "Опубліковано")}>Опублікувати</BulkBtn>
          <BulkBtn onClick={() => bulk("unpublish", "Знято з публікації")}>Сховати</BulkBtn>
          <BulkBtn onClick={() => bulk("in_stock", "В наявності")}>В наявності</BulkBtn>
          <BulkBtn onClick={() => bulk("out_of_stock", "Немає в наявності")}>Немає</BulkBtn>
          <BulkBtn onClick={() => bulk("feature", "Додано в обране")}>★ В обране</BulkBtn>
          <BulkBtn onClick={() => bulk("unfeature", "Прибрано з обраного")}>З обраного</BulkBtn>
          <BulkBtn onClick={() => bulk("delete", "Видалено")} danger>Видалити</BulkBtn>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[11px] uppercase tracking-wider text-white/50 hover:text-white">Скинути</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse bg-[#f7f9fa]" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#8a94a0]">Нічого не знайдено</p>
      ) : (
        <div className="border border-[#eef2f3]">
          <div className="flex items-center gap-3 border-b border-[#eef2f3] bg-[#f7f9fa] px-3 py-2">
            <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Обрати всі на сторінці</span>
          </div>
          <div className="divide-y divide-[#eef2f3]">
            {rows.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${selected.has(p.id) ? "bg-[#f7f9fa]" : ""}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0" />
                <div className="h-12 w-9 shrink-0 overflow-hidden bg-[#f7f9fa]">
                  {p.image_src && <img src={p.image_src} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[#2b2d42]">{p.featured && <span title="В обраному" className="mr-1 text-[#bf9b30]">★</span>}{p.name}{p.status !== "publish" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] uppercase text-amber-700">чернетка</span>}</p>
                  <p className="text-[11px] text-[#8a94a0]">{p.brand} · {p.category}{p.sku ? ` · ${p.sku}` : ""}</p>
                </div>
                {!p.is_in_stock && <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-[10px] text-[#8a94a0]">немає</span>}
                <span className="w-24 text-right text-[13px] tabular-nums text-[#2b2d42]">{formatPrice(p.price)}</span>
                <button onClick={() => openEdit(p.id)} className="text-[11px] uppercase tracking-wider text-[#8a94a0] underline underline-offset-2 hover:text-[#2b2d42]">Ред.</button>
                <button onClick={() => remove(p.id, p.name)} className="text-[11px] uppercase tracking-wider text-[#e5484d] hover:opacity-70">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={() => load(page - 1, search, stock)} disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] disabled:opacity-30">‹</button>
          <span className="min-w-16 text-center text-[12px] text-[#8a94a0]">{page} / {totalPages}</span>
          <button onClick={() => load(page + 1, search, stock)} disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] disabled:opacity-30">›</button>
        </div>
      )}

      {/* Editor drawer */}
      {editorId && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div onClick={() => setEditorId(null)} className="absolute inset-0 bg-black/40" />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-[#eef2f3] bg-white">
              <div className="flex items-center gap-2 px-6 py-4">
                {editorId !== "new" && (
                  <button onClick={() => setEditorId(null)} aria-label="Закрити" className="text-[#8a94a0] hover:text-[#2b2d42]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}
                <h3 className="text-[15px] font-medium text-[#2b2d42]">
                  {editorId === "new" ? "Новий товар" : `Товар ${editorId}`}
                </h3>
                {editorId !== "new" && (
                  <button onClick={() => openEdit(String(editorId))} title="Оновити" className="text-[#8a94a0] hover:text-[#2b2d42]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}
                {editorId === "new" && (
                  <button onClick={() => setEditorId(null)} className="ml-auto text-[#8a94a0] hover:text-[#2b2d42]">✕</button>
                )}
              </div>
              {editorId !== "new" && (
                <div className="px-6">
                  <SubTabs
                    tabs={[
                      { id: "product", label: "Товар" },
                      { id: "offers", label: "Торгові пропозиції" },
                      { id: "history", label: "Історія статусів" },
                    ]}
                    active={productTab}
                    onChange={setProductTab}
                  />
                </div>
              )}
            </div>

            {productTab === "product" && current && editorId !== "new" && (
              <div className="border-b border-[#eef2f3] bg-white px-6 py-5">
                <p className="mb-3 text-[13px] font-semibold text-[#2b2d42]">Загальні дані</p>
                <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Категорія</p>
                    <p className="mt-0.5 text-[13px] text-[#2b2d42]">{current.category || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Статус</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#2b2d42]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: moderationLabel(current).color }} />
                      {moderationLabel(current).label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Код товару</p>
                    <p className="mt-0.5 font-mono text-[13px] text-[#2b2d42]">{current.id}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Створено</p>
                    <p className="mt-0.5 text-[13px] text-[#2b2d42]">{new Date(current.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Оновлено</p>
                    <p className="mt-0.5 text-[13px] text-[#2b2d42]">{new Date(current.updated_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
                {/* Moderation actions — the visible set depends on current status,
                    exactly as in Intertop (a Чернетка offers «На модерацію»; a
                    На модерації item offers Підтвердити/На доопрацювання/В чернетку). */}
                <div className="flex flex-wrap items-center gap-2">
                  {current.moderation_status === "draft" && (
                    <ActionBtn primary busy={transitioning} onClick={() => transition({ moderation_status: "pending" }, "Чернетка → На модерації")}>На модерацію</ActionBtn>
                  )}
                  {current.moderation_status === "pending" && (
                    <>
                      <ActionBtn primary busy={transitioning} onClick={() => transition({ moderation_status: "approved", status: "publish" }, "На модерації → Підтверджено")}>Підтвердити</ActionBtn>
                      <ActionBtn busy={transitioning} onClick={() => transition({ moderation_status: "rejected" }, "На модерації → Не підтверджено")}>На доопрацювання</ActionBtn>
                      <ActionBtn busy={transitioning} onClick={() => transition({ moderation_status: "draft", status: "draft" }, "На модерації → Чернетка")}>В чернетку</ActionBtn>
                    </>
                  )}
                  {current.moderation_status === "rejected" && (
                    <>
                      <ActionBtn primary busy={transitioning} onClick={() => transition({ moderation_status: "approved", status: "publish" }, "Не підтверджено → Підтверджено")}>Підтвердити</ActionBtn>
                      <ActionBtn busy={transitioning} onClick={() => transition({ moderation_status: "draft", status: "draft" }, "Не підтверджено → Чернетка")}>В чернетку</ActionBtn>
                    </>
                  )}
                  {current.moderation_status === "approved" && (
                    <ActionBtn busy={transitioning} onClick={() => transition({ moderation_status: "draft", status: "draft" }, "Підтверджено → Чернетка")}>В чернетку</ActionBtn>
                  )}
                  <ActionBtn danger onClick={removeCurrent}>Видалити</ActionBtn>
                  <ActionBtn busy={transitioning} onClick={duplicateCurrent}>Копіювати</ActionBtn>
                </div>
              </div>
            )}

            {productTab === "offers" && editorId !== "new" && (
              <div className="px-5 py-5">
                <ProductOffersTab productId={editorId} onToast={onToast} />
              </div>
            )}
            {productTab === "history" && editorId !== "new" && (
              <div className="px-5 py-5">
                <ProductHistoryTab productId={editorId} />
              </div>
            )}

            {productTab === "product" && (
            <div className="bg-[#f4f6f7] px-5 py-5">
              <DetailCard title="Дані про товар">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={lbl}>Бренд *</span><input className={inp} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>SKU (внутрішній, «Артикул»)</span><input className={inp} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} /></label>
                  </div>
                  <label className="block">
                    <span className={lbl}>Заводський артикул постачальника *</span>
                    <input className={inp} value={draft.factory_article} onChange={(e) => setDraft({ ...draft, factory_article: e.target.value })}
                      placeholder="код, яким постачальник позначає товар у файлі ОСТАТКИ" />
                    <span className="mt-1 block text-[10px] text-[#aab4bf]">Саме за цим кодом залишки/ціни з файлу ОСТАТКИ автоматично підтягнуться до цього товару — без нього доведеться оновлювати вручну.</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={lbl}>Класифікатор: Стать *</span>
                      <select className={inp} value={draft.gender} onChange={(e) => {
                        const gender = e.target.value;
                        const stillValid = PRODUCT_CATEGORIES.find((c) => c.slug === draft.category_slug)?.genders.includes(gender as "men" | "women");
                        setDraft(stillValid ? { ...draft, gender } : { ...draft, gender, category: "", category_slug: "" });
                      }}>
                        <option value="">—</option>
                        <option value="women">Жінкам</option>
                        <option value="men">Чоловікам</option>
                      </select>
                    </label>
                    <label className="block"><span className={lbl}>Класифікатор: Категорія *</span>
                      <select className={inp} value={draft.category_slug} onChange={(e) => {
                        const opt = PRODUCT_CATEGORIES.find((c) => c.slug === e.target.value);
                        setDraft({ ...draft, category_slug: opt?.slug ?? "", category: opt?.label ?? "" });
                      }}>
                        <option value="">— оберіть категорію —</option>
                        {PRODUCT_CATEGORIES.filter((c) => !draft.gender || c.genders.includes(draft.gender as "men" | "women")).map((c) => (
                          <option key={c.slug} value={c.slug}>{c.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={lbl}>Ціна, ₴ *</span><input type="number" className={inp} value={draft.regular_price} onChange={(e) => setDraft({ ...draft, regular_price: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Акційна ціна, ₴</span><input type="number" className={inp} value={draft.sale_price} onChange={(e) => setDraft({ ...draft, sale_price: e.target.value })} /></label>
                  </div>
                </div>
              </DetailCard>

              {/* Intertop 2.1's exact per-language split: «Мова Українська» /
                  «Мова Російська» each carry their own Назва+Опис. Our existing
                  catalog content is Russian-language (see lib/pg.ts comment) —
                  Ukrainian starts genuinely empty, not backfilled with guesses. */}
              <DetailCard title="Мова Українська">
                <div className="space-y-4">
                  <label className="block"><span className={lbl}>Назва (uk)</span>
                    <input className={inp} value={draft.name_uk} onChange={(e) => setDraft({ ...draft, name_uk: e.target.value })} placeholder="ще не перекладено" /></label>
                  <label className="block"><span className={lbl}>Опис (uk)</span>
                    <textarea rows={3} className="w-full border border-[#e6eaec] bg-white p-3 text-[13px] focus:border-[#2b2d42] focus:outline-none"
                      value={draft.description_uk} onChange={(e) => setDraft({ ...draft, description_uk: e.target.value })} placeholder="ще не перекладено" /></label>
                </div>
              </DetailCard>

              <DetailCard title="Мова Російська">
                <div className="space-y-4">
                  <label className="block"><span className={lbl}>Назва (ru) *</span>
                    <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                  <label className="block"><span className={lbl}>Опис (ru)</span>
                    <textarea rows={3} className="w-full border border-[#e6eaec] bg-white p-3 text-[13px] focus:border-[#2b2d42] focus:outline-none"
                      value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
                </div>
              </DetailCard>

              <DetailCard title="Розміри та залишок">
                <SizeQtyEditor sizes={draft.sizes} onChange={(sizes) => setDraft({ ...draft, sizes })} />
              </DetailCard>

              <DetailCard title="Зображення">
                <ImageManager images={draft.images} onChange={(images) => setDraft({ ...draft, images })} onToast={onToast} />
              </DetailCard>

              <DetailCard title="Атрибути" defaultOpen={false}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={lbl}>Колір</span><input className={inp} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Склад</span><input className={inp} value={draft.composition} onChange={(e) => setDraft({ ...draft, composition: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Сезон</span><input className={inp} value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Країна</span><input className={inp} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Матеріал верху</span><input className={inp} value={draft.material} onChange={(e) => setDraft({ ...draft, material: e.target.value })} /></label>
                    <label className="block"><span className={lbl}>Підвид</span><input className={inp} value={draft.subtype} onChange={(e) => setDraft({ ...draft, subtype: e.target.value })} placeholder="напр. Прямі джинси — див. «Класифікатор товарів»" /></label>
                  </div>
                  <label className="block"><span className={lbl}>Короткий опис (внутрішній)</span><textarea rows={2} className="w-full border border-[#e6eaec] bg-white p-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" value={draft.short_description} onChange={(e) => setDraft({ ...draft, short_description: e.target.value })} /></label>
                </div>
              </DetailCard>

              <DetailCard title="Публікація">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-[13px] text-[#2b2d42]">
                    <input type="checkbox" checked={draft.is_in_stock} onChange={(e) => setDraft({ ...draft, is_in_stock: e.target.checked })} /> В наявності
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-[#2b2d42]">
                    <input type="checkbox" checked={draft.status === "publish"} onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "publish" : "draft" })} /> Опубліковано
                  </label>
                </div>
                {editorId !== "new" && (
                  <p className="mt-2 text-[11px] text-[#8a94a0]">
                    Ручний перемикач для швидкого правлення — офіційний робочий процес модерації вище («Загальні дані») теж керує цим полем.
                  </p>
                )}
              </DetailCard>

              {error && <p className="text-[13px] text-[#e5484d]">{error}</p>}
            </div>
            )}

            {productTab === "product" && (
            <div className="sticky bottom-0 flex gap-3 border-t border-[#eef2f3] bg-white px-6 py-4">
              <button onClick={save} disabled={saving} className="h-11 flex-1 border border-[#2f9488] text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
                {saving ? "Зберігаємо…" : editorId === "new" ? "Створити товар" : "Зберегти зміни"}
              </button>
              <button onClick={() => setEditorId(null)} className="h-11 border border-[#e6eaec] px-5 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
                Скасувати
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BulkBtn({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-[3px] px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${danger ? "text-[#ff8b7e] hover:bg-white/10" : "text-white/85 hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

/** Product-header moderation action (ПІДТВЕРДИТИ/НА ДООПРАЦЮВАННЯ/etc) —
 *  primary = filled teal (main forward action), danger = red text (delete),
 *  default = outlined neutral. */
function ActionBtn({ onClick, children, primary, danger, busy }: {
  onClick: () => void; children: React.ReactNode; primary?: boolean; danger?: boolean; busy?: boolean;
}) {
  const cls = primary
    ? "border-[#2f9488] bg-[#2f9488] text-white hover:bg-[#26766c]"
    : danger
    ? "border-[#e6eaec] bg-white text-[#e5484d] hover:border-[#e5484d]"
    : "border-[#e6eaec] bg-white text-[#2b2d42] hover:border-[#2b2d42]";
  return (
    <button onClick={onClick} disabled={busy} className={`h-9 rounded-[4px] border px-4 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}

/**
 * Real per-size stock, not just a cosmetic list of size names — each row
 * becomes a product_variants row (lib/products.ts syncManualVariants), so
 * the storefront size selector shows true availability and a future ОСТАТКИ
 * file has something real to update via offer_code/barcode matching.
 */
function SizeQtyEditor({ sizes, onChange }: { sizes: SizeRow[]; onChange: (s: SizeRow[]) => void }) {
  const inputCls = "h-10 w-full border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none";
  function addRow() { onChange([...sizes, { size: "", qty: "0" }]); }
  function removeRow(i: number) { onChange(sizes.filter((_, idx) => idx !== i)); }
  function update(i: number, field: "size" | "qty", val: string) {
    onChange(sizes.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }
  const total = sizes.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Розміри та залишок</span>
        {sizes.length > 0 && <span className="text-[10px] text-[#8a94a0]">Разом: {total} шт.</span>}
      </div>
      <div className="space-y-1.5">
        {sizes.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className={inputCls} style={{ flex: 2 }} placeholder="S, 42, One size…" value={s.size} onChange={(e) => update(i, "size", e.target.value)} />
            <input type="number" min={0} className={inputCls} style={{ flex: 1 }} placeholder="0" value={s.qty} onChange={(e) => update(i, "qty", e.target.value)} />
            <button type="button" onClick={() => removeRow(i)} className="shrink-0 px-1.5 text-[13px] text-[#e5484d] hover:opacity-70">✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-2 flex h-8 items-center gap-1.5 border border-[#e6eaec] bg-white px-3 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        Додати розмір
      </button>
    </div>
  );
}

function ImageManager({ images, onChange, onToast }: { images: string[]; onChange: (i: string[]) => void; onToast?: (m: string) => void }) {
  const [pending, setPending] = useState(0); // count of uploads in flight, for the "Завантаження… (n)" label
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null); // index being reordered
  const [overIdx, setOverIdx] = useState<number | null>(null); // index currently hovered while reordering
  const fileRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files).filter((f) => f.type.startsWith("image/")) : [];
    if (list.length === 0) return;
    setPending((n) => n + list.length);
    // Parallel upload — the old sequential loop made a 20-photo batch crawl.
    const results = await Promise.all(list.map(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.url) return data.url as string;
        onToast?.(data.error ?? `Помилка: ${file.name}`);
      } catch {
        onToast?.(`Мережева помилка: ${file.name}`);
      }
      return null;
    }));
    setPending((n) => n - list.length);
    const added = results.filter((u): u is string => !!u);
    if (added.length) onChange([...imagesRef.current, ...added]);
  }

  function addUrl() {
    const u = urlInput.trim();
    if (u) { onChange([...images, u]); setUrlInput(""); }
  }
  function removeAt(i: number) { onChange(images.filter((_, idx) => idx !== i)); }
  function makePrimary(i: number) {
    if (i === 0) return;
    const next = [...images];
    const [img] = next.splice(i, 1);
    next.unshift(img);
    onChange(next);
  }

  // Drag-to-reorder thumbnails (native HTML5 DnD — no extra library needed).
  function onThumbDragStart(i: number) { setDragIdx(i); }
  function onThumbDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setOverIdx(i); }
  function onThumbDrop(i: number) {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...images];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    onChange(next);
    setDragIdx(null); setOverIdx(null);
  }

  // Paste an image straight from the clipboard (screenshot, copied photo).
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((it) => it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) upload(files);
  }

  return (
    <div onPaste={onPaste}>
      <span className="text-[10px] uppercase tracking-wider text-[#8a94a0]">Фото (перше — головне · перетягніть, щоб змінити порядок)</span>
      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[#8a94a0]">
        <span>Макс. кількість: <b className="text-[#3a4250]">6</b></span><span className="text-[#d5dbe0]">·</span>
        <span>Мін.: <b className="text-[#3a4250]">2</b></span><span className="text-[#d5dbe0]">·</span>
        <span>Розмір: <b className="text-[#3a4250]">2700×3600</b></span><span className="text-[#d5dbe0]">·</span>
        <span>Пропорції: <b className="text-[#3a4250]">3:4</b></span><span className="text-[#d5dbe0]">·</span>
        <span>Формат: <b className="text-[#3a4250]">jpeg, png, jpg</b></span>
      </p>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div
              key={src + i}
              className={`group relative cursor-grab active:cursor-grabbing ${overIdx === i && dragIdx !== null && dragIdx !== i ? "ring-2 ring-[#2f9488]" : ""}`}
              draggable
              onDragStart={() => onThumbDragStart(i)}
              onDragOver={(e) => onThumbDragOver(e, i)}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={() => onThumbDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            >
              <img src={src} alt="" className={`h-24 w-[72px] object-cover ${i === 0 ? "ring-2 ring-[#2b2d42]" : "border border-[#eef2f3]"}`} />
              {i === 0 && <span className="absolute left-0 top-0 bg-[#2b2d42] px-1 text-[8px] uppercase text-white">гол.</span>}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && <button onClick={() => makePrimary(i)} title="Зробити головним" className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-[#2b2d42]">★</button>}
                <button onClick={() => removeAt(i)} title="Видалити" className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-[#e5484d]">✕</button>
              </div>
            </div>
          ))}
          {pending > 0 && Array.from({ length: pending }).map((_, i) => (
            <div key={`loading-${i}`} className="flex h-24 w-[72px] items-center justify-center border border-dashed border-[#d5dbe0] bg-[#f4f6f7]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b6c0ca] border-t-[#2b2d42]" />
            </div>
          ))}
        </div>
      )}

      {/* Drag-and-drop zone — click also opens the file picker */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`mt-2 flex h-16 cursor-pointer items-center justify-center gap-2 border border-dashed text-[12px] transition-colors ${
          dragOver ? "border-[#2b2d42] bg-[#f4f6f7] text-[#2b2d42]" : "border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#b6c0ca]"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {pending > 0 ? `Завантаження… (${pending})` : "Перетягніть фото сюди, натисніть, або вставте з буфера (Ctrl+V)"}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </div>

      <div className="mt-2 flex gap-2">
        <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
          placeholder="або вставте URL фото" className="h-9 flex-1 border border-[#e6eaec] bg-white px-3 text-[12px] focus:border-[#2b2d42] focus:outline-none" />
        <button type="button" onClick={addUrl} className="h-9 border border-[#e6eaec] px-3 text-[12px] text-[#2b2d42] hover:border-[#2b2d42]">Додати</button>
      </div>
    </div>
  );
}

/* ── «Торгові пропозиції» tab (per-product) ──────────────────────────────
 * Intertop's per-product offers screen: one row per size, edited inline
 * (toggle + number inputs directly in the table), «Зберегти»/«Скасувати»
 * at the bottom — not a slide-over. Reuses /api/admin/variants (filtered to
 * this product) for reads and the new PATCH /api/admin/variants/bulk
 * (per-row patches) for writes. */
type OfferRow = {
  id: string; size: string; sku: string; product_id: string;
  factory_article: string; barcode: string; stock_qty: number; price: number | null;
  sale_price: number | null; base_price: number | null; active: boolean;
  weight_pack: number | null; height_pack: number | null; width_pack: number | null; length_pack: number | null;
};
type OfferDraft = {
  stock_qty: string; price: string; sale_price: string; active: boolean; barcode: string;
  weight_pack: string; height_pack: string; width_pack: string; length_pack: string;
};

function ProductOffersTab({ productId, onToast }: { productId: string; onToast?: (m: string) => void }) {
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/variants?productId=${productId}&perPage=200`)
      .then((r) => r.json())
      .then((d) => setRows((d.variants ?? []) as OfferRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(load, [load]);

  function startEdit() {
    const next: Record<string, OfferDraft> = {};
    for (const r of rows) {
      next[r.id] = {
        stock_qty: String(r.stock_qty),
        price: r.price != null ? String(r.price) : "",
        sale_price: r.sale_price != null ? String(r.sale_price) : "",
        active: r.active,
        barcode: r.barcode || "",
        weight_pack: r.weight_pack != null ? String(r.weight_pack) : "",
        height_pack: r.height_pack != null ? String(r.height_pack) : "",
        width_pack: r.width_pack != null ? String(r.width_pack) : "",
        length_pack: r.length_pack != null ? String(r.length_pack) : "",
      };
    }
    setDrafts(next);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const updates = rows.map((r) => {
      const d = drafts[r.id];
      return {
        id: r.id,
        patch: {
          stock_qty: Number(d.stock_qty) || 0,
          price: d.price ? Number(d.price) : null,
          sale_price: d.sale_price ? Number(d.sale_price) : null,
          active: d.active,
          barcode: d.barcode.trim(),
          weight_pack: d.weight_pack ? Number(d.weight_pack) : null,
          height_pack: d.height_pack ? Number(d.height_pack) : null,
          width_pack: d.width_pack ? Number(d.width_pack) : null,
          length_pack: d.length_pack ? Number(d.length_pack) : null,
        },
      };
    });
    try {
      const res = await fetch("/api/admin/variants/bulk", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates, productId }),
      });
      const data = await res.json();
      if (res.ok) { onToast?.(`Оновлено пропозицій: ${data.count}`); setEditing(false); load(); }
      else onToast?.(data.error ?? "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const thCls = "whitespace-nowrap border-b border-[#eef2f3] bg-[#f7f9fa] px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[#8a94a0]";
  const cellInp = "h-8 w-24 border border-[#e6eaec] bg-white px-2 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none";

  if (loading) return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 animate-pulse bg-[#f7f9fa]" />)}</div>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] text-[#8a94a0]">{rows.length} {rows.length === 1 ? "пропозиція" : "пропозицій"}</p>
        <div className="flex items-center gap-2">
          {!editing && rows.length > 0 && (
            <button onClick={startEdit} className="h-8 border border-[#2f9488] px-3 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
              Змінити залишки та ціни
            </button>
          )}
          <button onClick={() => setCreateOpen(true)} className="h-8 border border-[#2b2d42] bg-[#2b2d42] px-3 text-[11px] uppercase tracking-wider text-white hover:bg-[#3a4250]">
            Створити торгову пропозицію
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[#8a94a0]">У товару ще немає торгових пропозицій — створіть першу кнопкою вище.</p>
      ) : (
      <div className="overflow-x-auto border border-[#eef2f3]">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Активність</th>
              <th className={thCls}>Внутр. номер</th>
              <th className={thCls}>SKU</th>
              <th className={thCls}>Заводський артикул</th>
              <th className={thCls}>Штрихкод</th>
              <th className={thCls}>Розмір</th>
              <th className={thCls}>Ціна</th>
              <th className={thCls}>Акційна ціна</th>
              <th className={thCls}>Залишок</th>
              <th className={thCls}>Вага, кг</th>
              <th className={thCls}>Висота, см</th>
              <th className={thCls}>Ширина, см</th>
              <th className={thCls}>Довжина, см</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const innerNo = r.sku || r.product_id;
              const skuCode = `${innerNo}-${r.size}`;
              const d = drafts[r.id];
              return (
                <tr key={r.id} className="border-b border-[#eef2f3]">
                  <td className="px-3 py-2">
                    {editing ? (
                      <button onClick={() => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], active: !p[r.id].active } }))}
                        className={`relative h-5 w-9 rounded-full transition-colors ${d.active ? "bg-[#2f9488]" : "bg-[#d5dbe0]"}`}>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${d.active ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    ) : (
                      <span className="text-[#5a6472]">{r.active ? "Так" : "Ні"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-[#2b2d42]">{innerNo}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-[#2b2d42]">{skuCode}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px] text-[#5a6472]">{r.factory_article || "—"}</td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input className={cellInp} value={d.barcode} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], barcode: e.target.value } }))} />
                      : <span className="font-mono text-[12px] text-[#5a6472]">{r.barcode || "—"}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[#5a6472]">{r.size || "—"}</td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.price} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], price: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.price != null ? formatPrice(r.price) : r.base_price != null ? formatPrice(r.base_price) : "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.sale_price} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], sale_price: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.sale_price != null ? formatPrice(r.sale_price) : "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.stock_qty} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], stock_qty: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.stock_qty}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.weight_pack} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], weight_pack: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.weight_pack ?? "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.height_pack} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], height_pack: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.height_pack ?? "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.width_pack} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], width_pack: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.width_pack ?? "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editing
                      ? <input type="number" className={cellInp} value={d.length_pack} onChange={(e) => setDrafts((p) => ({ ...p, [r.id]: { ...p[r.id], length_pack: e.target.value } }))} />
                      : <span className="text-[#5a6472]">{r.length_pack ?? "—"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {editing && (
        <div className="mt-3 flex gap-3">
          <button onClick={save} disabled={saving} className="h-9 border border-[#2f9488] px-5 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
            {saving ? "Зберігаємо…" : "Зберегти"}
          </button>
          <button onClick={() => setEditing(false)} className="h-9 border border-[#e6eaec] px-5 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
            Скасувати
          </button>
        </div>
      )}
      {createOpen && (
        <CreateOfferPanel
          productId={productId}
          existingSizes={new Set(rows.map((r) => r.size))}
          basePrice={rows[0]?.base_price ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={(msg) => { onToast?.(msg); setCreateOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/* ── «Створити торгову пропозицію» / «Генератор торгових пропозицій» ────
 * Guide 2.1 §6: one panel, one size at a time by default; the "Генератор"
 * link switches to picking several sizes at once (checkboxes) and applies
 * the same price/stock/packaging across all of them — same underlying call
 * (POST /api/admin/variants), just one item per picked size. */
const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "ONESIZE"];

function CreateOfferPanel({ productId, existingSizes, basePrice, onClose, onCreated }: {
  productId: string; existingSizes: Set<string>; basePrice: number | null;
  onClose: () => void; onCreated: (msg: string) => void;
}) {
  const [generator, setGenerator] = useState(false);
  const [size, setSize] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [pickedSizes, setPickedSizes] = useState<Set<string>>(new Set());
  const [barcode, setBarcode] = useState("");
  const [active, setActive] = useState(true);
  const [price, setPrice] = useState(basePrice != null ? String(basePrice) : "");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [weightPack, setWeightPack] = useState("");
  const [heightPack, setHeightPack] = useState("");
  const [widthPack, setWidthPack] = useState("");
  const [lengthPack, setLengthPack] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleSize(s: string) {
    setPickedSizes((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  async function submit() {
    const sizes = generator ? [...pickedSizes] : [size.trim() || customSize.trim()];
    const cleanSizes = sizes.filter(Boolean);
    if (cleanSizes.length === 0) { setError("Оберіть хоча б один розмір"); return; }
    if (!price || Number(price) <= 0) { setError("Вкажіть ціну"); return; }
    setError(""); setSaving(true);
    try {
      const items = cleanSizes.map((s) => ({
        size: s,
        barcode: generator ? "" : barcode.trim(), // one shared barcode makes no sense across several sizes
        price: Number(price),
        sale_price: salePrice ? Number(salePrice) : null,
        stock_qty: Number(stock) || 0,
        active,
        weight_pack: weightPack ? Number(weightPack) : null,
        height_pack: heightPack ? Number(heightPack) : null,
        width_pack: widthPack ? Number(widthPack) : null,
        length_pack: lengthPack ? Number(lengthPack) : null,
      }));
      const res = await fetch("/api/admin/variants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: Number(productId), items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      onCreated(`Створено пропозицій: ${data.created}${data.skippedExisting ? ` (${data.skippedExisting} вже існували)` : ""}`);
    } finally {
      setSaving(false);
    }
  }

  const lbl = "text-[10px] uppercase tracking-wider text-[#8a94a0]";
  const inp = "mt-1 h-10 w-full border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none";

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eef2f3] px-5 py-4">
          <h3 className="text-[15px] font-medium text-[#2b2d42]">
            {generator ? "Генератор торгових пропозицій" : "Створити торгову пропозицію"}
          </h3>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]">✕</button>
        </div>

        <div className="flex-1 space-y-4 px-5 py-5">
          {!generator && (
            <button onClick={() => setGenerator(true)} className="text-[11px] uppercase tracking-wider text-[#2f9488] hover:underline">
              Генератор торгових пропозицій →
            </button>
          )}

          {!generator ? (
            <>
              <label className="block"><span className={lbl}>Штрихкод торгової пропозиції</span>
                <input className={inp} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="порожньо — згенерується автоматично" /></label>
              <label className="block"><span className={lbl}>Розмір *</span>
                <select className={inp} value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">— оберіть —</option>
                  {COMMON_SIZES.filter((s) => !existingSizes.has(s)).map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="__custom">інший…</option>
                </select>
              </label>
              {size === "__custom" && (
                <label className="block"><span className={lbl}>Свій розмір</span>
                  <input className={inp} value={customSize} onChange={(e) => setCustomSize(e.target.value)} /></label>
              )}
            </>
          ) : (
            <div>
              <span className={lbl}>Розмір * (оберіть кілька — для кожного створиться своя пропозиція з однаковою ціною/залишком)</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_SIZES.filter((s) => !existingSizes.has(s)).map((s) => (
                  <button key={s} type="button" onClick={() => toggleSize(s)}
                    className={`h-8 rounded-[3px] border px-3 text-[12px] transition-colors ${pickedSizes.has(s) ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] bg-white text-[#2b2d42] hover:border-[#2f9488]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-[13px] text-[#2b2d42]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Активність
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={lbl}>Ціна, ₴ *</span>
              <input type="number" className={inp} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <label className="block"><span className={lbl}>Акційна ціна, ₴</span>
              <input type="number" className={inp} value={salePrice} onChange={(e) => setSalePrice(e.target.value)} /></label>
          </div>
          <label className="block"><span className={lbl}>Залишок на торговому складі *</span>
            <input type="number" min={0} className={inp} value={stock} onChange={(e) => setStock(e.target.value)} /></label>

          <div>
            <p className={`${lbl} mb-2`}>Властивості упаковки (необов&apos;язково)</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={lbl}>Вага, кг</span>
                <input type="number" className={inp} value={weightPack} onChange={(e) => setWeightPack(e.target.value)} /></label>
              <label className="block"><span className={lbl}>Висота, см</span>
                <input type="number" className={inp} value={heightPack} onChange={(e) => setHeightPack(e.target.value)} /></label>
              <label className="block"><span className={lbl}>Ширина, см</span>
                <input type="number" className={inp} value={widthPack} onChange={(e) => setWidthPack(e.target.value)} /></label>
              <label className="block"><span className={lbl}>Довжина, см</span>
                <input type="number" className={inp} value={lengthPack} onChange={(e) => setLengthPack(e.target.value)} /></label>
            </div>
          </div>

          {error && <p className="text-[13px] text-[#e5484d]">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex gap-3 border-t border-[#eef2f3] bg-white px-5 py-4">
          <button onClick={submit} disabled={saving} className="h-11 flex-1 border border-[#2f9488] text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
            {saving ? "Зберігаємо…" : "Створити"}
          </button>
          <button onClick={onClose} className="h-11 border border-[#e6eaec] px-5 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── «Історія статусів» tab (per-product) ────────────────────────────────
 * Reads /api/admin/products/[id]/activity — admin_activity rows scoped by
 * product_id. Only entries logged after that column existed show up; older
 * history simply isn't there (honest empty state, not fabricated). */
type HistoryEntry = { id: string; action: string; summary: string; count: number | null; author: string; created_at: string };
const HISTORY_LABEL: Record<string, string> = {
  save: "Збереження", delete: "Видалення", import: "Імпорт", export: "Експорт",
  photos: "Фото", settings: "Налаштування", status: "Статус",
};

function ProductHistoryTab({ productId }: { productId: string }) {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/products/${productId}/activity`)
      .then((r) => r.json())
      .then((d) => setRows((d.activity ?? []) as HistoryEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse bg-[#f7f9fa]" />)}</div>;
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-[#8a94a0]">
        Ще немає записів історії для цього товару — зʼявляться після наступного збереження.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[#eef2f3] border border-[#eef2f3]">
      {rows.map((h) => (
        <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
          <span className="rounded border border-[#e6eaec] bg-[#f7f9fa] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#5a6472]">
            {HISTORY_LABEL[h.action] ?? h.action}
          </span>
          <span className="min-w-0 flex-1 text-[#2b2d42]">{h.summary}</span>
          <span className="shrink-0 text-[11px] text-[#8a94a0]">{new Date(h.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      ))}
    </div>
  );
}
