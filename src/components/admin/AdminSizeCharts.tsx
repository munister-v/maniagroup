"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "./intertop/primitives";

type SizeRow = { label: string; eu?: string; us?: string; uk?: string; cm?: string };
type SizeChart = { id: string; brand: string; name: string; gender: string; chart: SizeRow[]; created_at: string };

const GENDERS = [
  { value: "", label: "Усі" },
  { value: "woman", label: "Жінки" },
  { value: "man", label: "Чоловіки" },
  { value: "kids", label: "Діти" },
];

const emptyRow = (): SizeRow => ({ label: "", eu: "", us: "", uk: "", cm: "" });

function emptyForm(): { brand: string; name: string; gender: string; chart: SizeRow[] } {
  return { brand: "", name: "", gender: "", chart: [emptyRow()] };
}

export function AdminSizeCharts() {
  const [charts, setCharts] = useState<SizeChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SizeChart | null | "new">(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/size-charts")
      .then((r) => r.json())
      .then((d) => setCharts((d.charts ?? []) as SizeChart[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => { setForm(emptyForm()); setEditing("new"); };
  const openEdit = (c: SizeChart) => {
    setForm({ brand: c.brand, name: c.name, gender: c.gender, chart: c.chart.length ? c.chart : [emptyRow()] });
    setEditing(c);
  };

  const save = async () => {
    setSaving(true);
    const body = { ...form, chart: form.chart.filter((r) => r.label.trim() !== "") };
    try {
      if (editing === "new") {
        await fetch("/api/admin/size-charts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else if (editing) {
        await fetch(`/api/admin/size-charts/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: SizeChart) => {
    if (!confirm(`Видалити розмірну сітку «${c.name || c.brand}»?`)) return;
    await fetch(`/api/admin/size-charts/${c.id}`, { method: "DELETE" });
    load();
  };

  const setRow = (i: number, patch: Partial<SizeRow>) => {
    setForm((f) => ({ ...f, chart: f.chart.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  };
  const addRow = () => setForm((f) => ({ ...f, chart: [...f.chart, emptyRow()] }));
  const removeRow = (i: number) => setForm((f) => ({ ...f, chart: f.chart.filter((_, idx) => idx !== i) }));

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";
  const genderLabel = (g: string) => GENDERS.find((x) => x.value === g)?.label ?? "—";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#2b2d42]">Розмірні сітки</h2>
          <p className="mt-0.5 text-[12px] text-[#8a94a0]">{charts.length.toLocaleString("uk-UA")} записів</p>
        </div>
        <button
          onClick={openNew}
          className="ml-auto h-9 rounded-[4px] border border-[#2f9488] px-4 text-[13px] font-medium text-[#2f9488] transition-colors hover:bg-[#2f9488] hover:text-white"
        >
          СТВОРИТИ СІТКУ
        </button>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={thCls}>Бренд</th>
              <th className={thCls}>Назва</th>
              <th className={thCls}>Стать</th>
              <th className={`${thCls} text-right`}>Розмірів</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : charts.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-12 text-center text-[#8a94a0]">Ще немає розмірних сіток</td></tr>
            ) : charts.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]" onClick={() => openEdit(c)}>
                <td className="px-3 py-2.5 text-[#2b2d42]">{c.brand || "—"}</td>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{c.name || "—"}</td>
                <td className="px-3 py-2.5 text-[#5a6472]">{genderLabel(c.gender)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{c.chart.length}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(c); }}
                    className="text-[12px] text-[#c0524a] hover:underline"
                  >
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
        title={editing === "new" ? "Нова розмірна сітка" : `Редагувати «${editing ? editing.name : ""}»`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="h-9 flex-1 rounded-[4px] border border-[#e6eaec] text-[13px] text-[#5a6472] hover:bg-[#f7f9fa]">Скасувати</button>
            <button onClick={save} disabled={saving} className="h-9 flex-1 rounded-[4px] bg-[#2f9488] text-[13px] font-medium text-white transition-colors hover:bg-[#267b71] disabled:opacity-50">
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Бренд</span>
            <input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Назва</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[#8a94a0]">Стать</span>
            <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
              className="h-9 w-full rounded-[4px] border border-[#e6eaec] px-3 text-[13px] focus:border-[#2f9488] focus:outline-none">
              {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>

          <div>
            <span className="mb-2 block text-[12px] text-[#8a94a0]">Розміри</span>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-1.5 text-[11px] text-[#8a94a0]">
                <span>Розмір</span><span>EU</span><span>US</span><span>UK</span><span>CM</span><span></span>
              </div>
              {form.chart.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-1.5">
                  <input value={row.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder="M"
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <input value={row.eu ?? ""} onChange={(e) => setRow(i, { eu: e.target.value })}
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <input value={row.us ?? ""} onChange={(e) => setRow(i, { us: e.target.value })}
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <input value={row.uk ?? ""} onChange={(e) => setRow(i, { uk: e.target.value })}
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <input value={row.cm ?? ""} onChange={(e) => setRow(i, { cm: e.target.value })}
                    className="h-8 rounded-[4px] border border-[#e6eaec] px-2 text-[12px] focus:border-[#2f9488] focus:outline-none" />
                  <button onClick={() => removeRow(i)} aria-label="Видалити рядок"
                    className="flex h-8 w-8 items-center justify-center text-[#8a94a0] hover:text-[#c0524a]">✕</button>
                </div>
              ))}
            </div>
            <button onClick={addRow} className="mt-2 text-[12px] font-medium text-[#2f9488] hover:underline">+ Додати розмір</button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
