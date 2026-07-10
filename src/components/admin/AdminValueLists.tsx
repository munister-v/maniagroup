"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

type ValueListRow = { id: string; name: string; created_at: string; updated_at: string; item_count?: number };
type ValueListDetail = ValueListRow & { values: string[] };

const emptyForm = (): { name: string; values: string[] } => ({ name: "", values: [""] });

export function AdminValueLists() {
  const [lists, setLists] = useState<ValueListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ValueListDetail | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/value-lists")
      .then((r) => r.json())
      .then((d) => setLists((d.lists ?? []) as ValueListRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => { setForm(emptyForm()); setEditing("new"); };
  const openEdit = async (l: ValueListRow) => {
    const r = await fetch(`/api/admin/value-lists/${l.id}`);
    const d = await r.json();
    const full = d.list as ValueListDetail;
    if (!full) return;
    setForm({ name: full.name, values: full.values.length ? full.values : [""] });
    setEditing(full);
  };

  const save = async () => {
    setSaving(true);
    const body = { name: form.name, values: form.values.filter((v) => v.trim() !== "") };
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

  const remove = async (l: ValueListRow) => {
    if (!confirm(`Видалити список «${l.name}»?`)) return;
    await fetch(`/api/admin/value-lists/${l.id}`, { method: "DELETE" });
    load();
  };

  const setValue = (i: number, v: string) => setForm((f) => ({ ...f, values: f.values.map((x, idx) => (idx === i ? v : x)) }));
  const addValue = () => setForm((f) => ({ ...f, values: [...f.values, ""] }));
  const removeValue = (i: number) => setForm((f) => ({ ...f, values: f.values.filter((_, idx) => idx !== i) }));

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Списки значень</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">
            Контрольовані словники (колір, стать, сезон тощо) — {lists.length.toLocaleString("uk-UA")} записів
          </p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          СТВОРИТИ СПИСОК
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Назва</th>
              <th className={`${thCls} text-right`}>Значень</th>
              <th className={thCls}>Оновлено</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : lists.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-12 text-center text-[#8a94a0]">Ще немає списків значень</td></tr>
            ) : lists.map((l) => (
              <tr key={l.id} className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={() => openEdit(l)}>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{l.name}</td>
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
        footer={
          <>
            <button onClick={() => setEditing(null)} className="h-9 flex-1 rounded-[4px] border border-[#e6eaec] text-[13px] text-[#5a6472] hover:bg-[#f7f9fa]">Скасувати</button>
            <button onClick={save} disabled={saving || !form.name.trim()} className="h-9 flex-1 rounded-[4px] bg-[#2f9488] text-[13px] font-medium text-white transition-colors hover:bg-[#267b71] disabled:opacity-50">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Назва списку</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Напр. «Кольори»"
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          <div>
            <span className="mb-2 block text-[12px] text-[#8a94a0]">Значення</span>
            <div className="space-y-2">
              {form.values.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={v} onChange={(e) => setValue(i, e.target.value)}
                    className="h-8 flex-1 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <button onClick={() => removeValue(i)} aria-label="Видалити значення"
                    className="flex h-8 w-8 items-center justify-center text-[#8a94a0] hover:text-[#c0524a]">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addValue} className="mt-2 text-[12px] font-medium text-[#2f9488] hover:underline">+ Додати значення</button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
