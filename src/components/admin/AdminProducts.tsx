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
  image_src: string;
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
  image_src: "", sizes: "", color: "", composition: "", season: "", country: "",
  short_description: "", description: "",
};

function draftFromProduct(p: FullProduct): Draft {
  const sizes = (p.attributes?.find((a) => a.taxonomy === "pa_size")?.terms ?? []).map((t) => t.name).join(", ");
  return {
    name: p.name, brand: p.brand, sku: p.sku, category: p.category, gender: p.gender,
    regular_price: String(p.regular_price ?? ""), sale_price: p.sale_price ? String(p.sale_price) : "",
    is_in_stock: p.is_in_stock, status: p.status, image_src: p.image_src,
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
    image_src: d.image_src.trim(),
    images: d.image_src.trim() ? [{ src: d.image_src.trim() }] : [],
    sizes: d.sizes.split(",").map((s) => s.trim()).filter(Boolean),
    color: d.color.trim(),
    composition: d.composition.trim(),
    season: d.season.trim(),
    country: d.country.trim(),
    short_description: d.short_description,
    description: d.description,
  };
}

export function AdminProducts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editorId, setEditorId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      setRows(data.products ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(""); }, [load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(v), 350);
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
    load(search);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Видалити «${name}»? Цю дію не можна скасувати.`)) return;
    const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    if (res.ok) load(search);
  }

  const inp = "h-10 w-full border border-[#e5ded3] bg-white px-3 text-[13px] text-[#17130f] focus:border-[#17130f] focus:outline-none";
  const lbl = "text-[10px] uppercase tracking-wider text-[#9c8f7d]";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[#17130f]">Товари</h2>
          <p className="text-[12px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} у каталозі</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Пошук за назвою, брендом, SKU…"
            className="h-10 w-64 border border-[#e5ded3] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none"
          />
          <button onClick={openNew} className="h-10 bg-[#17130f] px-5 text-[11px] uppercase tracking-wider text-white hover:opacity-85">
            + Додати товар
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse bg-[#f3efe8]" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#9c8f7d]">Нічого не знайдено</p>
      ) : (
        <div className="divide-y divide-[#eee7db] border border-[#eee7db]">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="h-12 w-9 shrink-0 overflow-hidden bg-[#f3efe8]">
                {p.image_src && <img src={p.image_src} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[#17130f]">{p.name}</p>
                <p className="text-[11px] text-[#9c8f7d]">{p.brand} · {p.category}{p.sku ? ` · ${p.sku}` : ""}</p>
              </div>
              {!p.is_in_stock && <span className="rounded bg-[#f5f5f5] px-2 py-0.5 text-[10px] text-[#9c8f7d]">немає</span>}
              <span className="w-24 text-right text-[13px] tabular-nums text-[#17130f]">{formatPrice(p.price)}</span>
              <button onClick={() => openEdit(p.id)} className="text-[11px] uppercase tracking-wider text-[#9c8f7d] underline underline-offset-2 hover:text-[#17130f]">Ред.</button>
              <button onClick={() => remove(p.id, p.name)} className="text-[11px] uppercase tracking-wider text-[#b3392c] hover:opacity-70">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Editor drawer */}
      {editorId && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div onClick={() => setEditorId(null)} className="absolute inset-0 bg-black/40" />
          <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#eee7db] bg-white px-6 py-4">
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
              <label className="block"><span className={lbl}>Посилання на фото</span><input className={inp} value={draft.image_src} onChange={(e) => setDraft({ ...draft, image_src: e.target.value })} placeholder="https://…" /></label>
              {draft.image_src && <img src={draft.image_src} alt="" className="h-40 w-auto border border-[#eee7db] object-cover" />}
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
