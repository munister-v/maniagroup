"use client";

import { useEffect, useState } from "react";

type Cat = { id: string; name: string; slug: string; parent: string; product_count: number };

const btn = "h-9 px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors";
const teal = btn + " bg-[#007B6E] text-white hover:bg-[#006B5E]";
const ghost = btn + " border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E]";
const inp = "w-full h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]";

export function ErpCategories() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", parent: "0" });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/erp/categories");
    setCats(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    if (editing) {
      await fetch("/api/erp/categories", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...form, parent: Number(form.parent) }),
      });
    } else {
      await fetch("/api/erp/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parent: Number(form.parent) }),
      });
    }
    setSaving(false); setShowForm(false); setEditing(null); load();
  }
  async function del(id: string) {
    if (!confirm("Видалити категорію? Підкатегорії стануть кореневими.")) return;
    await fetch("/api/erp/categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  function openEdit(cat: Cat) {
    setForm({ name: cat.name, slug: cat.slug, parent: cat.parent });
    setEditing(cat); setShowForm(true);
  }
  function openNew() {
    setForm({ name: "", slug: "", parent: "0" });
    setEditing(null); setShowForm(true);
  }
  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Build tree
  const roots = cats.filter((c) => c.parent === "0");
  const children = (parentId: string) => cats.filter((c) => c.parent === parentId);

  function CatRow({ cat, depth = 0 }: { cat: Cat; depth?: number }) {
    return (
      <>
        <tr className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA]">
          <td className="px-4 py-2.5" style={{ paddingLeft: 16 + depth * 20 }}>
            {depth > 0 && <span className="text-[#BDBDBD] mr-2">└</span>}
            <span className="text-[#212121] font-medium">{cat.name}</span>
          </td>
          <td className="px-4 py-2.5 text-[#9E9E9E] font-mono text-[12px]">{cat.slug}</td>
          <td className="px-4 py-2.5 text-center text-[#9E9E9E]">{cat.product_count}</td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(cat)} className="text-[12px] text-[#007B6E] hover:underline">Ред.</button>
              <button onClick={() => del(cat.id)} className="text-[#BDBDBD] hover:text-red-600 text-[13px]">✕</button>
            </div>
          </td>
        </tr>
        {children(cat.id).map((child) => <CatRow key={child.id} cat={child} depth={depth + 1} />)}
      </>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-normal text-[#212121]">Категорії</h1>
          <p className="text-[13px] text-[#9E9E9E]">{cats.length} категорій · дерево з вкладеністю</p>
        </div>
        <button onClick={openNew} className={teal}>+ Нова категорія</button>
      </div>

      {showForm && (
        <div className="mb-4 border border-[#E0E0E0] bg-white p-5 space-y-4 max-w-[500px]">
          <h2 className="text-[15px] text-[#212121]">{editing ? "Редагувати" : "Нова категорія"}</h2>
          <label className="block"><span className={lbl}>Назва</span>
            <input value={form.name} onChange={(e) => { setF("name", e.target.value); if (!editing) setF("slug", e.target.value.toLowerCase().replace(/\s+/g, "-")); }} className={inp} /></label>
          <label className="block"><span className={lbl}>Slug (URL)</span>
            <input value={form.slug} onChange={(e) => setF("slug", e.target.value)} className={inp} /></label>
          <label className="block"><span className={lbl}>Батьківська категорія</span>
            <select value={form.parent} onChange={(e) => setF("parent", e.target.value)} className={inp}>
              <option value="0">— Коренева (без батьківської) —</option>
              {cats.filter((c) => c.id !== editing?.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select></label>
          <div className="flex gap-2 justify-end border-t border-[#F5F5F5] pt-3">
            <button onClick={() => { setShowForm(false); setEditing(null); }} className={ghost}>Скасувати</button>
            <button onClick={save} disabled={saving || !form.name.trim()} className={teal}>{saving ? "Збереження…" : "Зберегти"}</button>
          </div>
        </div>
      )}

      <div className="border border-[#E0E0E0] bg-white">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#E0E0E0] text-[11px] text-[#9E9E9E]">
            <th className="px-4 py-3 text-left font-normal">Назва</th>
            <th className="px-4 py-3 text-left font-normal">Slug</th>
            <th className="px-4 py-3 text-center font-normal">Товарів</th>
            <th className="px-4 py-3 w-24" />
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="py-10 text-center text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && !roots.length && <tr><td colSpan={4} className="py-10 text-center text-[#9E9E9E]">Категорій немає</td></tr>}
            {roots.map((cat) => <CatRow key={cat.id} cat={cat} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
