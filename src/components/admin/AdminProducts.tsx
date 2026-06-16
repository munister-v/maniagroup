"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/catalog";

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
  images: { src: string }[];
  attributes: { taxonomy: string; terms: { name: string; slug: string }[] }[];
  description: string;
  short_description: string;
  color: string;
  country: string;
  season: string;
  collection: string;
  composition: string;
};

type Draft = {
  name: string;
  brand: string;
  sku: string;
  category: string;
  gender: string;
  regular_price: string;
  sale_price: string;
  is_in_stock: boolean;
  status: string;
  images: string[];
  sizes: string;
  color: string;
  composition: string;
  season: string;
  country: string;
  short_description: string;
  description: string;
};

const EMPTY_DRAFT: Draft = {
  name: "", brand: "", sku: "", category: "", gender: "",
  regular_price: "", sale_price: "", is_in_stock: true, status: "publish",
  images: [], sizes: "", color: "", composition: "", season: "", country: "",
  short_description: "", description: "",
};

const PER_PAGE = 30;

const STOCK_TABS = [
  { value: "", label: "Всі" },
  { value: "in", label: "В наявності" },
  { value: "out", label: "Немає" },
] as const;

function draftFromProduct(p: FullProduct): Draft {
  const sizes = (p.attributes?.find((a) => a.taxonomy === "pa_size")?.terms ?? []).map((t) => t.name).join(", ");
  const images = (p.images ?? []).map((i) => i.src).filter(Boolean);
  if (images.length === 0 && p.image_src) images.push(p.image_src);
  return {
    name: p.name, brand: p.brand, sku: p.sku, category: p.category, gender: p.gender,
    regular_price: String(p.regular_price ?? ""), sale_price: p.sale_price ? String(p.sale_price) : "",
    is_in_stock: p.is_in_stock, status: p.status, images,
    sizes, color: p.color ?? "", composition: p.composition ?? "", season: p.season ?? "",
    country: p.country ?? "", short_description: p.short_description ?? "", description: p.description ?? "",
  };
}

function draftToPayload(d: Draft) {
  return {
    name: d.name.trim(),
    brand: d.brand.trim() || "Mania Group",
    sku: d.sku.trim(),
    category: d.category.trim() || "Одяг",
    gender: d.gender,
    regular_price: Number(d.regular_price) || 0,
    sale_price: d.sale_price ? Number(d.sale_price) : null,
    is_in_stock: d.is_in_stock,
    status: d.status,
    image_src: d.images[0] ?? "",
    images: d.images.map((src) => ({ src })),
    sizes: d.sizes.split(",").map((s) => s.trim()).filter(Boolean),
    color: d.color.trim(),
    composition: d.composition.trim(),
    season: d.season.trim(),
    country: d.country.trim(),
    short_description: d.short_description,
    description: d.description,
  };
}

export function AdminProducts({ onToast }: { onToast?: (msg: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorId, setEditorId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
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
    setEditorId(id);
  }

  function openNew() {
    setError("");
    setDraft(EMPTY_DRAFT);
    setEditorId("new");
  }

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
  const inp = "h-10 w-full border border-[#e5ded3] bg-white px-3 text-[13px] text-[#17130f] focus:border-[#17130f] focus:outline-none";
  const lbl = "text-[10px] uppercase tracking-wider text-[#9c8f7d]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#17130f]">Товари</h2>
          <p className="text-[12px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} у каталозі</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Назва, бренд, SKU…"
            className="h-10 w-64 border border-[#e5ded3] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none" />
          <button onClick={openPriceRule} className="h-10 shrink-0 border border-[#e5ded3] bg-white px-4 text-[11px] uppercase tracking-wider text-[#17130f] hover:border-[#17130f]">
            Знижки
          </button>
          <button onClick={openNew} className="h-10 shrink-0 bg-[#17130f] px-5 text-[11px] uppercase tracking-wider text-white hover:opacity-85">
            + Додати
          </button>
        </div>
      </div>

      {showRule && (
        <div className="mb-4 rounded-[3px] border border-[#e8e4de] bg-[#faf8f5] p-4">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-[#9c8f7d]">Масова знижка на бренд</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className={lbl}>Бренд</span>
              <select value={rule.scope} onChange={(e) => setRule({ ...rule, scope: e.target.value })}
                className="h-10 border border-[#e5ded3] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none">
                <option value="">— оберіть —</option>
                {ruleBrands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={lbl}>Знижка, %</span>
              <input type="number" min="0" max="95" value={rule.percent} onChange={(e) => setRule({ ...rule, percent: e.target.value })}
                placeholder="20" className="h-10 w-24 border border-[#e5ded3] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none" />
            </label>
            <button onClick={() => applyRule(false)} disabled={ruleBusy}
              className="h-10 bg-[#17130f] px-5 text-[11px] uppercase tracking-wider text-white hover:opacity-85 disabled:opacity-50">
              {ruleBusy ? "…" : "Застосувати"}
            </button>
            <button onClick={() => applyRule(true)} disabled={ruleBusy}
              className="h-10 border border-[#e5ded3] bg-white px-4 text-[11px] uppercase tracking-wider text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f]">
              Зняти знижку
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#9c8f7d]">Встановлює акційну ціну = звичайна × (1 − %). «Зняти знижку» повертає звичайну ціну.</p>
        </div>
      )}

      {/* Stock filter tabs */}
      <div className="mb-4 flex gap-1.5">
        {STOCK_TABS.map((t) => (
          <button key={t.value} onClick={() => setStock(t.value)}
            className={`h-8 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              stock === t.value ? "bg-[#17130f] text-white" : "border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[3px] border border-[#17130f] bg-[#17130f] px-3 py-2 text-white">
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
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse bg-[#f3efe8]" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#9c8f7d]">Нічого не знайдено</p>
      ) : (
        <div className="border border-[#eee7db]">
          <div className="flex items-center gap-3 border-b border-[#eee7db] bg-[#faf8f5] px-3 py-2">
            <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Обрати всі на сторінці</span>
          </div>
          <div className="divide-y divide-[#eee7db]">
            {rows.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${selected.has(p.id) ? "bg-[#faf8f5]" : ""}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0" />
                <div className="h-12 w-9 shrink-0 overflow-hidden bg-[#f3efe8]">
                  {p.image_src && <img src={p.image_src} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[#17130f]">{p.featured && <span title="В обраному" className="mr-1 text-[#bf9b30]">★</span>}{p.name}{p.status !== "publish" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] uppercase text-amber-700">чернетка</span>}</p>
                  <p className="text-[11px] text-[#9c8f7d]">{p.brand} · {p.category}{p.sku ? ` · ${p.sku}` : ""}</p>
                </div>
                {!p.is_in_stock && <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-[10px] text-[#9c8f7d]">немає</span>}
                <span className="w-24 text-right text-[13px] tabular-nums text-[#17130f]">{formatPrice(p.price)}</span>
                <button onClick={() => openEdit(p.id)} className="text-[11px] uppercase tracking-wider text-[#9c8f7d] underline underline-offset-2 hover:text-[#17130f]">Ред.</button>
                <button onClick={() => remove(p.id, p.name)} className="text-[11px] uppercase tracking-wider text-[#b3392c] hover:opacity-70">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && total > PER_PAGE && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={() => load(page - 1, search, stock)} disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] disabled:opacity-30">‹</button>
          <span className="min-w-16 text-center text-[12px] text-[#9c8f7d]">{page} / {totalPages}</span>
          <button onClick={() => load(page + 1, search, stock)} disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] disabled:opacity-30">›</button>
        </div>
      )}

      {/* Editor drawer */}
      {editorId && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div onClick={() => setEditorId(null)} className="absolute inset-0 bg-black/40" />
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eee7db] bg-white px-6 py-4">
              <h3 className="text-[15px] font-medium text-[#17130f]">{editorId === "new" ? "Новий товар" : "Редагування товару"}</h3>
              <button onClick={() => setEditorId(null)} className="text-[#9c8f7d] hover:text-[#17130f]">✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <label className="block"><span className={lbl}>Назва *</span><input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Бренд</span><input className={inp} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} /></label>
                <label className="block"><span className={lbl}>SKU / артикул</span><input className={inp} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Категорія</span><input className={inp} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
                <label className="block"><span className={lbl}>Стать</span>
                  <select className={inp} value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })}>
                    <option value="">—</option>
                    <option value="women">Жінкам</option>
                    <option value="men">Чоловікам</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Ціна, ₴ *</span><input type="number" className={inp} value={draft.regular_price} onChange={(e) => setDraft({ ...draft, regular_price: e.target.value })} /></label>
                <label className="block"><span className={lbl}>Акційна ціна, ₴</span><input type="number" className={inp} value={draft.sale_price} onChange={(e) => setDraft({ ...draft, sale_price: e.target.value })} /></label>
              </div>
              <label className="block"><span className={lbl}>Розміри (через кому)</span><input className={inp} value={draft.sizes} onChange={(e) => setDraft({ ...draft, sizes: e.target.value })} placeholder="S, M, L, XL" /></label>

              <ImageManager images={draft.images} onChange={(images) => setDraft({ ...draft, images })} onToast={onToast} />

              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={lbl}>Колір</span><input className={inp} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
                <label className="block"><span className={lbl}>Склад</span><input className={inp} value={draft.composition} onChange={(e) => setDraft({ ...draft, composition: e.target.value })} /></label>
                <label className="block"><span className={lbl}>Сезон</span><input className={inp} value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} /></label>
                <label className="block"><span className={lbl}>Країна</span><input className={inp} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></label>
              </div>
              <label className="block"><span className={lbl}>Короткий опис</span><textarea rows={2} className="w-full border border-[#e5ded3] bg-white p-3 text-[13px] focus:border-[#17130f] focus:outline-none" value={draft.short_description} onChange={(e) => setDraft({ ...draft, short_description: e.target.value })} /></label>
              <label className="block"><span className={lbl}>Повний опис</span><textarea rows={4} className="w-full border border-[#e5ded3] bg-white p-3 text-[13px] focus:border-[#17130f] focus:outline-none" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-[13px] text-[#17130f]">
                  <input type="checkbox" checked={draft.is_in_stock} onChange={(e) => setDraft({ ...draft, is_in_stock: e.target.checked })} /> В наявності
                </label>
                <label className="flex items-center gap-2 text-[13px] text-[#17130f]">
                  <input type="checkbox" checked={draft.status === "publish"} onChange={(e) => setDraft({ ...draft, status: e.target.checked ? "publish" : "draft" })} /> Опубліковано
                </label>
              </div>
              {error && <p className="text-[13px] text-[#b3392c]">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex gap-3 border-t border-[#eee7db] bg-white px-6 py-4">
              <button onClick={save} disabled={saving} className="h-11 flex-1 bg-[#17130f] text-[11px] uppercase tracking-wider text-white hover:opacity-85 disabled:opacity-50">
                {saving ? "Зберігаємо…" : editorId === "new" ? "Створити товар" : "Зберегти зміни"}
              </button>
              <button onClick={() => setEditorId(null)} className="h-11 border border-[#e5ded3] px-5 text-[11px] uppercase tracking-wider text-[#17130f] hover:border-[#17130f]">
                Скасувати
              </button>
            </div>
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

function ImageManager({ images, onChange, onToast }: { images: string[]; onChange: (i: string[]) => void; onToast?: (m: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.url) added.push(data.url);
      else onToast?.(data.error ?? "Помилка завантаження");
    }
    setUploading(false);
    if (added.length) onChange([...images, ...added]);
    if (fileRef.current) fileRef.current.value = "";
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

  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Фото (перше — головне)</span>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={src + i} className="group relative">
              <img src={src} alt="" className={`h-24 w-[72px] object-cover ${i === 0 ? "ring-2 ring-[#17130f]" : "border border-[#eee7db]"}`} />
              {i === 0 && <span className="absolute left-0 top-0 bg-[#17130f] px-1 text-[8px] uppercase text-white">гол.</span>}
              <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 && <button onClick={() => makePrimary(i)} title="Зробити головним" className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-[#17130f]">★</button>}
                <button onClick={() => removeAt(i)} title="Видалити" className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-[#b3392c]">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex h-9 items-center gap-2 border border-[#e5ded3] bg-white px-3 text-[12px] text-[#17130f] hover:border-[#17130f] disabled:opacity-50">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {uploading ? "Завантаження…" : "Завантажити фото"}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
          placeholder="або вставте URL фото" className="h-9 flex-1 border border-[#e5ded3] bg-white px-3 text-[12px] focus:border-[#17130f] focus:outline-none" />
        <button type="button" onClick={addUrl} className="h-9 border border-[#e5ded3] px-3 text-[12px] text-[#17130f] hover:border-[#17130f]">Додати</button>
      </div>
    </div>
  );
}
