"use client";

import { useEffect, useState } from "react";

type SizeRow = { label: string; eu?: string; us?: string; uk?: string; cm?: string };
type Chart = { id: string; brand: string; name: string; gender: string; chart: SizeRow[] };

const btn = "h-9 px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors";
const teal = btn + " bg-[#007B6E] text-white hover:bg-[#006B5E]";
const ghost = btn + " border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E]";
const inp = "h-8 border border-[#E0E0E0] bg-white px-2 text-[12px] focus:border-[#007B6E] focus:outline-none w-full";
const lbl = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]";

const GENDER_LABEL: Record<string, string> = { "": "Усі", women: "Жіноче", men: "Чоловіче" };

const DEFAULT_ROWS: SizeRow[] = [
  { label: "XS", eu: "32–34", us: "0–2", uk: "4–6", cm: "80–84" },
  { label: "S",  eu: "36–38", us: "4–6", uk: "8–10", cm: "84–88" },
  { label: "M",  eu: "40–42", us: "8–10", uk: "12–14", cm: "88–92" },
  { label: "L",  eu: "44–46", us: "12–14", uk: "16–18", cm: "92–96" },
  { label: "XL", eu: "48–50", us: "16–18", uk: "20–22", cm: "96–100" },
];

export function ErpSizeCharts() {
  const [charts, setCharts] = useState<Chart[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Chart | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ brand: "", name: "Таблиця розмірів", gender: "", rows: DEFAULT_ROWS });

  async function load() {
    setLoading(true);
    const r = await fetch("/api/erp/size-charts");
    setCharts(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (editing) {
      await fetch("/api/erp/size-charts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...form, chart: form.rows }),
      });
    } else {
      await fetch("/api/erp/size-charts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, chart: form.rows }),
      });
    }
    setCreating(false); setEditing(null); load();
  }
  async function del(id: string) {
    if (!confirm("Видалити таблицю?")) return;
    await fetch("/api/erp/size-charts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  function openEdit(chart: Chart) {
    setForm({ brand: chart.brand, name: chart.name, gender: chart.gender, rows: chart.chart });
    setEditing(chart); setCreating(true);
  }
  function openNew() {
    setForm({ brand: "", name: "Таблиця розмірів", gender: "", rows: DEFAULT_ROWS });
    setEditing(null); setCreating(true);
  }
  function updateRow(i: number, field: keyof SizeRow, val: string) {
    setForm((f) => ({ ...f, rows: f.rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r) }));
  }
  function addRow() {
    setForm((f) => ({ ...f, rows: [...f.rows, { label: "", eu: "", us: "", uk: "", cm: "" }] }));
  }
  function removeRow(i: number) {
    setForm((f) => ({ ...f, rows: f.rows.filter((_, idx) => idx !== i) }));
  }

  if (creating) return (
    <div className="p-6 max-w-[900px]">
      <button onClick={() => { setCreating(false); setEditing(null); }} className="mb-3 text-[13px] font-medium uppercase text-[#9E9E9E] hover:text-[#007B6E]">‹ Назад</button>
      <h2 className="mb-4 text-[20px] text-[#212121]">{editing ? "Редагувати таблицю" : "Нова таблиця розмірів"}</h2>
      <div className="border border-[#E0E0E0] bg-white p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <label className="block"><span className={lbl}>Бренд</span>
            <input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className={inp + " h-9 px-3 text-[13px]"} placeholder="напр. Armani" /></label>
          <label className="block"><span className={lbl}>Назва таблиці</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inp + " h-9 px-3 text-[13px]"} /></label>
          <label className="block"><span className={lbl}>Стать</span>
            <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))} className={inp + " h-9 px-3 text-[13px]"}>
              {Object.entries(GENDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
        </div>

        <div>
          <p className={lbl}>Таблиця розмірів</p>
          <table className="w-full text-[12px]">
            <thead><tr className="text-[11px] text-[#9E9E9E] border-b border-[#F5F5F5]">
              {["Розмір", "EU", "US", "UK", "CM / обхват"].map((h) => <th key={h} className="py-1.5 pr-2 text-left font-normal">{h}</th>)}
              <th className="w-6" />
            </tr></thead>
            <tbody>
              {form.rows.map((row, i) => (
                <tr key={i} className="border-b border-[#F5F5F5]">
                  <td className="py-1 pr-2"><input value={row.label} onChange={(e) => updateRow(i, "label", e.target.value)} className={inp} placeholder="XS" /></td>
                  <td className="py-1 pr-2"><input value={row.eu ?? ""} onChange={(e) => updateRow(i, "eu", e.target.value)} className={inp} placeholder="36–38" /></td>
                  <td className="py-1 pr-2"><input value={row.us ?? ""} onChange={(e) => updateRow(i, "us", e.target.value)} className={inp} placeholder="4–6" /></td>
                  <td className="py-1 pr-2"><input value={row.uk ?? ""} onChange={(e) => updateRow(i, "uk", e.target.value)} className={inp} placeholder="8–10" /></td>
                  <td className="py-1 pr-2"><input value={row.cm ?? ""} onChange={(e) => updateRow(i, "cm", e.target.value)} className={inp} placeholder="84–88 см" /></td>
                  <td className="py-1"><button onClick={() => removeRow(i)} className="text-[#BDBDBD] hover:text-red-600">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} className="mt-2 text-[12px] text-[#007B6E] hover:underline">+ Додати рядок</button>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#F5F5F5]">
          <button onClick={() => { setCreating(false); setEditing(null); }} className={ghost}>Скасувати</button>
          <button onClick={save} className={teal}>Зберегти</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-normal text-[#212121]">Таблиці розмірів</h1>
          <p className="text-[13px] text-[#9E9E9E]">Показуються покупцям на сторінці товару</p>
        </div>
        <button onClick={openNew} className={teal}>+ Нова таблиця</button>
      </div>

      {loading && <p className="py-8 text-center text-[#9E9E9E]">Завантаження…</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map((chart) => (
          <div key={chart.id} className="border border-[#E0E0E0] bg-white p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium text-[#212121]">{chart.name}</p>
                <p className="text-[12px] text-[#9E9E9E]">
                  {chart.brand || "Всі бренди"} · {GENDER_LABEL[chart.gender] ?? "Усі"}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(chart)} className="text-[12px] text-[#007B6E] hover:underline">Редагувати</button>
                <button onClick={() => del(chart.id)} className="text-[#BDBDBD] hover:text-red-600">✕</button>
              </div>
            </div>
            <table className="w-full text-[11px]">
              <thead><tr className="text-[10px] text-[#9E9E9E] border-b border-[#F5F5F5]">
                {["Розмір", "EU", "US", "UK", "CM"].map((h) => <th key={h} className="py-1 text-left font-normal">{h}</th>)}
              </tr></thead>
              <tbody>
                {chart.chart.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-[#F5F5F5]">
                    <td className="py-1 font-medium text-[#212121]">{row.label}</td>
                    <td className="py-1 text-[#424242]">{row.eu || "—"}</td>
                    <td className="py-1 text-[#424242]">{row.us || "—"}</td>
                    <td className="py-1 text-[#424242]">{row.uk || "—"}</td>
                    <td className="py-1 text-[#424242]">{row.cm || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {chart.chart.length > 5 && <p className="text-[11px] text-[#9E9E9E] mt-1">+ {chart.chart.length - 5} рядків</p>}
          </div>
        ))}
        {!loading && !charts.length && (
          <div className="col-span-2 py-12 text-center text-[#9E9E9E]">Таблиць ще немає</div>
        )}
      </div>
    </div>
  );
}
