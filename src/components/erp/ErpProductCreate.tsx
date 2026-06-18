"use client";

import { useEffect, useRef, useState } from "react";
import { aiAutofill, aiDescription } from "./aiAssist";

const inp = "h-9 w-full rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none";
const lbl = "mb-1 block text-[10px] uppercase tracking-wider text-[#9c8f7d]";

type SizeRow = { size: string; qty: string };
type Facets = { brands: string[]; categories: { name: string }[]; colors: string[]; seasons: string[] };

export function ErpProductCreate({ onDone, onCancel }: { onDone: (id: string | null) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [color, setColor] = useState("");
  const [composition, setComposition] = useState("");
  const [season, setSeason] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [regular, setRegular] = useState("");
  const [sale, setSale] = useState("");
  const [cost, setCost] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>([{ size: "", qty: "" }]);
  const [facets, setFacets] = useState<Facets>({ brands: [], categories: [], colors: [], seasons: [] });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ai, setAi] = useState<"" | "fill" | "desc">("");
  const [aiErr, setAiErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── AI assist: infer fields + description from the name (only fills empties). ──
  async function magicFill() {
    if (!name.trim()) { setAiErr("Спершу введіть назву"); return; }
    setAi("fill"); setAiErr("");
    try {
      const f = await aiAutofill({ name, brand, category, color, season, composition, gender });
      if (f.category && !category.trim()) setCategory(f.category);
      if (f.gender && !gender.trim()) setGender(f.gender);
      if (f.color && !color.trim()) setColor(f.color);
      if (f.season && !season.trim()) setSeason(f.season);
      if (f.composition && !composition.trim()) setComposition(f.composition);
      if (f.brand && !brand.trim()) setBrand(f.brand);
      if (f.description && !description.trim()) setDescription(f.description);
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }
  async function genDesc() {
    if (!name.trim()) { setAiErr("Спершу введіть назву"); return; }
    setAi("desc"); setAiErr("");
    try { const t = await aiDescription({ name, brand, category, color, season, composition }); if (t) setDescription(t); }
    catch (e) { setAiErr(e instanceof Error ? e.message : "Помилка ШІ"); }
    setAi("");
  }

  useEffect(() => {
    fetch("/api/admin/products/facets").then((r) => r.json()).then((d) =>
      setFacets({ brands: d.brands ?? [], categories: d.categories ?? [], colors: d.colors ?? [], seasons: d.seasons ?? [] })
    ).catch(() => {});
  }, []);

  async function upload(files: FileList | File[]) {
    setUploading(true); setErr("");
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const fd = new FormData(); fd.append("file", f);
      try {
        const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (d.url) setImages((prev) => [...prev, d.url]);
        else if (d.error) setErr(d.error);
      } catch { setErr("Помилка завантаження фото"); }
    }
    setUploading(false);
  }

  const margin = (() => {
    const p = Number(sale) > 0 ? Number(sale) : Number(regular);
    const c = Number(cost);
    if (!(p > 0) || !(c > 0)) return null;
    return Math.round(((p - c) / p) * 100);
  })();

  const totalUnits = sizes.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  async function save() {
    if (!name.trim()) { setErr("Вкажіть назву"); return; }
    if (!(Number(regular) > 0)) { setErr("Вкажіть ціну"); return; }
    setSaving(true); setErr("");
    const body = {
      name, brand, category, gender, color, composition, season, sku, description,
      regular_price: Number(regular),
      sale_price: Number(sale) > 0 ? Number(sale) : null,
      cost_price: Number(cost) > 0 ? Number(cost) : null,
      images,
      sizes: sizes.filter((s) => s.size.trim()).map((s) => ({ size: s.size.trim(), qty: Number(s.qty) || 0 })),
    };
    try {
      const r = await fetch("/api/erp/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (r.ok && d.id) onDone(d.id);
      else setErr(d.error ?? "Помилка збереження");
    } catch { setErr("Помилка мережі"); }
    setSaving(false);
  }

  const card = "rounded-[4px] border border-[#e2ddd5] bg-white p-4";
  const cardTitle = "mb-3 text-[11px] uppercase tracking-[0.12em] text-[#9c8f7d]";

  return (
    <div className="mx-auto max-w-[1000px] p-6">
      <button onClick={onCancel} className="mb-3 text-[12px] uppercase tracking-[0.1em] text-[#9c8f7d] hover:text-[#17130f]">‹ До товарів</button>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-light tracking-tight">Новий товар</h1>
        <div className="flex items-center gap-2">
          {aiErr && <span className="text-[12px] text-red-600">{aiErr}</span>}
          {err && <span className="text-[12px] text-red-600">{err}</span>}
          <button onClick={magicFill} disabled={ai !== "" || !name.trim()} title="Розпізнати поля та опис із назви"
            className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#c2a878] px-3 text-[11px] uppercase tracking-[0.1em] text-[#8a6d3b] transition-colors hover:bg-[#faf6ee] disabled:opacity-40">
            <span>✨</span>{ai === "fill" ? "Аналіз…" : "Заповнити з назви"}
          </button>
          <button onClick={save} disabled={saving}
            className="h-9 rounded-[3px] bg-[#17130f] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
            {saving ? "Збереження…" : "Опублікувати"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="space-y-4">
          <div className={card}>
            <label className="block">
              <span className={lbl}>Назва товару *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Сукня жіноча PINKO" className={inp + " h-10 text-[15px]"} autoFocus />
            </label>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className={lbl + " mb-0"}>Опис</span>
                <button onClick={genDesc} disabled={ai !== "" || !name.trim()} type="button"
                  className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#8a6d3b] hover:text-[#17130f] disabled:opacity-40">
                  ✨ {ai === "desc" ? "Генерую…" : "Згенерувати"}
                </button>
              </div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                className="w-full resize-none rounded-[3px] border border-[#e2ddd5] bg-white px-3 py-2 text-[13px] focus:border-[#17130f] focus:outline-none" />
            </div>
          </div>

          {/* Photos */}
          <div className={card}>
            <p className={cardTitle}>Фото товару</p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-[4px] border-2 border-dashed border-[#e0dacf] px-4 py-6 text-center transition-colors hover:border-[#b9ae9b]">
              <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7 text-[#c8c0b4]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="mt-1 text-[12px] text-[#9c8f7d]">{uploading ? "Завантаження…" : "Перетягніть фото або натисніть"}</p>
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => e.target.files && upload(e.target.files)} />
            </div>
            {images.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <div key={i} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-16 w-16 rounded-[3px] border border-[#e2ddd5] object-cover" />
                    {i === 0 && <span className="absolute left-0 top-0 rounded-br-[3px] bg-[#17130f] px-1 text-[8px] uppercase tracking-wider text-white">головне</span>}
                    <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sizes & stock */}
          <div className={card}>
            <div className="mb-3 flex items-center justify-between">
              <p className={cardTitle + " mb-0"}>Розміри та залишки</p>
              <span className="text-[11px] text-[#9c8f7d]">Усього: <b className="tabular-nums text-[#17130f]">{totalUnits}</b> од</span>
            </div>
            <div className="space-y-2">
              {sizes.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={row.size} onChange={(e) => setSizes((s) => s.map((x, j) => j === i ? { ...x, size: e.target.value } : x))}
                    placeholder="Розмір (напр. M)" className={inp + " w-40"} />
                  <input value={row.qty} onChange={(e) => setSizes((s) => s.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                    placeholder="К-сть" inputMode="numeric" className={inp + " w-28"} />
                  <button onClick={() => setSizes((s) => s.length > 1 ? s.filter((_, j) => j !== i) : s)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-[#b9ae9b] hover:bg-[#fdecec] hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
            <button onClick={() => setSizes((s) => [...s, { size: "", qty: "" }])}
              className="mt-2 text-[11px] uppercase tracking-wider text-[#9c8f7d] hover:text-[#17130f]">+ Додати розмір</button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Pricing */}
          <div className={card}>
            <p className={cardTitle}>Ціни</p>
            <label className="block"><span className={lbl}>Звичайна ціна, ₴ *</span>
              <input value={regular} onChange={(e) => setRegular(e.target.value)} inputMode="numeric" className={inp} /></label>
            <label className="mt-3 block"><span className={lbl}>Акційна ціна, ₴</span>
              <input value={sale} onChange={(e) => setSale(e.target.value)} inputMode="numeric" className={inp} /></label>
            <label className="mt-3 block"><span className={lbl}>Закупка (собівартість), ₴</span>
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" className={inp} /></label>
            {margin != null && (
              <p className={`mt-2 text-[12px] ${margin < 0 ? "text-red-600" : "text-green-700"}`}>Маржа: <b>{margin}%</b></p>
            )}
          </div>

          {/* Organization */}
          <div className={card}>
            <p className={cardTitle}>Організація</p>
            <label className="block"><span className={lbl}>Бренд</span>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} list="erp-brands" className={inp} />
              <datalist id="erp-brands">{facets.brands.map((b) => <option key={b} value={b} />)}</datalist>
            </label>
            <label className="mt-3 block"><span className={lbl}>Категорія</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} list="erp-cats" className={inp} />
              <datalist id="erp-cats">{facets.categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            </label>
            <label className="mt-3 block"><span className={lbl}>Стать</span>
              <select value={gender} onChange={(e) => setGender(e.target.value)} className={inp + " pr-7"}>
                <option value="">—</option><option value="women">Жіноче</option><option value="men">Чоловіче</option>
              </select>
            </label>
            <label className="mt-3 block"><span className={lbl}>Колір</span>
              <input value={color} onChange={(e) => setColor(e.target.value)} list="erp-colors" className={inp} />
              <datalist id="erp-colors">{facets.colors.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="mt-3 block"><span className={lbl}>Склад тканини</span>
              <input value={composition} onChange={(e) => setComposition(e.target.value)} placeholder="напр. Бавовна 95%, Еластан 5%" className={inp} /></label>
            <label className="mt-3 block"><span className={lbl}>Артикул (SKU)</span>
              <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="авто, якщо порожньо" className={inp} /></label>
          </div>
        </div>
      </div>
    </div>
  );
}
