"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

type ValueListRow = { seller_value: string; value: string };
type ValueListSummary = { id: string; name: string; property_key: string; created_at: string; updated_at: string; item_count?: number };
type ValueListDetail = ValueListSummary & { rows: ValueListRow[] };
type PropertyOption = { key: string; label: string; group: "offer" | "product" };
type LinkedTemplate = { id: string; name: string };

const emptyForm = (): { name: string; property_key: string; rows: ValueListRow[] } =>
  ({ name: "", property_key: "", rows: [{ seller_value: "", value: "" }] });

export function AdminValueLists() {
  const [lists, setLists] = useState<ValueListSummary[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ValueListDetail | null | "new">(null);
  const [linked, setLinked] = useState<LinkedTemplate[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/value-lists")
      .then((r) => r.json())
      .then((d) => setLists((d.lists ?? []) as ValueListSummary[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/admin/import-templates/properties")
      .then((r) => r.json())
      .then((d) => setProperties((d.properties ?? []) as PropertyOption[]))
      .catch(() => {});
  }, []);

  const openNew = () => { setForm(emptyForm()); setLinked([]); setEditing("new"); };
  const openEdit = async (l: ValueListSummary) => {
    const r = await fetch(`/api/admin/value-lists/${l.id}`);
    const d = await r.json();
    const full = d.list as ValueListDetail;
    if (!full) return;
    setForm({
      name: full.name, property_key: full.property_key,
      rows: full.rows.length ? full.rows.map((r) => ({ seller_value: r.seller_value, value: r.value })) : [{ seller_value: "", value: "" }],
    });
    setLinked((d.linkedTemplates ?? []) as LinkedTemplate[]);
    setEditing(full);
  };

  const save = async () => {
    setSaving(true);
    const body = { name: form.name, property_key: form.property_key, rows: form.rows.filter((r) => r.seller_value.trim() !== "") };
    try {
      if (editing === "new") {
        await fetch("/api/admin/value-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (editing) {
        await fetch(`/api/admin/value-lists/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: ValueListSummary) => {
    if (!confirm(`Видалити список «${l.name}»?`)) return;
    await fetch(`/api/admin/value-lists/${l.id}`, { method: "DELETE" });
    load();
  };

  const setRow = (i: number, patch: Partial<ValueListRow>) =>
    setForm((f) => ({ ...f, rows: f.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const addRow = () => setForm((f) => ({ ...f, rows: [...f.rows, { seller_value: "", value: "" }] }));
  const removeRow = (i: number) => setForm((f) => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }));
  /** Intertop's "Автоматичне зіставлення" — we have no reference vocabulary
   *  to match against, so this is an honest 1:1 fill: copies the seller
   *  value straight into any still-empty canonical cell. */
  const autoMatch = () => setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.value.trim() ? r : { ...r, value: r.seller_value })) }));

  const propLabel = (key: string) => properties.find((p) => p.key === key)?.label ?? key;
  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Списки значень</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">
            Зіставлення «значення продавця → наше значення» для однієї властивості — {lists.length.toLocaleString("uk-UA")} записів
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          СТВОРИТИ СПИСОК ЗНАЧЕНЬ
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>ID</th>
              <th className={thCls}>Назва</th>
              <th className={thCls}>Властивість</th>
              <th className={`${thCls} text-right`}>Значень</th>
              <th className={thCls}>Оновлено</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : lists.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-[#8a94a0]">Ще немає списків значень</td></tr>
            ) : lists.map((l) => (
              <tr key={l.id} className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={() => openEdit(l)}>
                <td className="px-3 py-2.5 text-[#5a6472]">{l.id}</td>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{l.name}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{l.property_key ? propLabel(l.property_key) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{l.item_count ?? 0}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{new Date(l.updated_at).toLocaleDateString("uk-UA")}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={(e) => { e.stopPropagation(); remove(l); }} className="text-[12px] text-[#c0524a] hover:underline">
                    Видалити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOver
        open={editing !== null}
        title={editing === "new" ? "Новий список значень" : `Редагувати «${editing ? editing.name : ""}»`}
        onClose={() => setEditing(null)}
        width="max-w-2xl"
        footer={
          <>
            <button onClick={() => setEditing(null)} className="h-9 flex-1 rounded-[4px] border border-[#e6eaec] text-[13px] text-[#5a6472] hover:bg-[#f7f9fa]">Скасувати</button>
            <button onClick={save} disabled={saving || !form.name.trim() || !form.property_key} className="h-9 flex-1 rounded-[4px] bg-[#2f9488] text-[13px] font-medium text-white transition-colors hover:bg-[#267b71] disabled:opacity-50">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Назва списку</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр. «Розмір_Взуття»"
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Властивість</span>
            <select value={form.property_key} onChange={(e) => setForm((f) => ({ ...f, property_key: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              <option value="">— оберіть —</option>
              <optgroup label="Торгова пропозиція">
                {properties.filter((p) => p.group === "offer").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>
              <optgroup label="Товар">
                {properties.filter((p) => p.group === "product").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>
            </select>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="block text-[12px] text-[#8a94a0]">Зіставлення значень</span>
              <button onClick={autoMatch} className="text-[12px] font-medium text-[#2f9488] hover:underline">Автоматичне зіставлення</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[11px] text-[#8a94a0]">
                <span>Значення продавця</span><span>Значення</span><span></span>
              </div>
              {form.rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
                  <input value={r.seller_value} onChange={(e) => setRow(i, { seller_value: e.target.value })} placeholder="42"
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <input value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="M"
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <button onClick={() => removeRow(i)} aria-label="Видалити значення"
                    className="flex h-8 w-8 items-center justify-center text-[#8a94a0] hover:text-[#c0524a]">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addRow} className="mt-2 text-[12px] font-medium text-[#2f9488] hover:underline">+ Додати значення</button>
          </div>

          {editing !== "new" && (
            <div>
              <span className="mb-2 block text-[12px] text-[#8a94a0]">Пов'язані шаблони</span>
              {linked.length === 0 ? (
                <p className="text-[12px] text-[#c3ccd4]">Цей список не використовується в жодному шаблоні</p>
              ) : (
                <ul className="space-y-1 text-[13px] text-[#2b2d42]">
                  {linked.map((t) => <li key={t.id}>{t.name}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
