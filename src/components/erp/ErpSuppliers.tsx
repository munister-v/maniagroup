"use client";

import { useCallback, useEffect, useState } from "react";

type Supplier = {
  id: number; name: string; contact: string; phone: string; note: string;
  receipts: number; units: number; total: number; last_receipt: string | null;
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
const inp = "h-9 rounded-[3px] border border-[#e2ddd5] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none";

export function ErpSuppliers() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/erp/suppliers").then((r) => r.json()).then((d) => setRows(d.suppliers ?? [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce((a, r) => ({ spent: a.spent + r.total, units: a.units + r.units, receipts: a.receipts + r.receipts }), { spent: 0, units: 0, receipts: 0 });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-light tracking-tight">Постачальники</h1>
          <p className="text-[12px] text-[#9c8f7d]">Довідник постачальників і закупівельна аналітика по кожному.</p>
        </div>
        <button onClick={() => setCreating(true)} className="h-9 rounded-[3px] bg-[#17130f] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85">+ Постачальник</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: "Постачальників", v: rows.length.toLocaleString("uk-UA") },
          { l: "Закуплено одиниць", v: totals.units.toLocaleString("uk-UA") },
          { l: "Сума закупівель", v: uah(totals.spent) },
        ].map((k) => (
          <div key={k.l} className="rounded-[4px] border border-[#e2ddd5] bg-white p-3">
            <p className="text-[20px] font-light tabular-nums">{k.v}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-[#9c8f7d]">{k.l}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#e2ddd5] bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
              <th className="px-4 py-3 text-left">Постачальник</th>
              <th className="px-4 py-3 text-left">Контакт</th>
              <th className="px-4 py-3 text-right">Приходів</th>
              <th className="px-4 py-3 text-right">Одиниць</th>
              <th className="px-4 py-3 text-right">Сума</th>
              <th className="px-4 py-3 text-left">Останній</th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f7f4f0]">
            {loading && !rows.length && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9c8f7d]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9c8f7d]">Постачальників ще немає</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setEditing(r)} className="cursor-pointer hover:bg-[#fafaf8]">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-[#17130f]">{r.name || "—"}</p>
                  {r.note && <p className="truncate text-[11px] text-[#9c8f7d]">{r.note}</p>}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-[#9c8f7d]">{[r.contact, r.phone].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.receipts}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.units.toLocaleString("uk-UA")}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{uah(r.total)}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#9c8f7d]">{r.last_receipt ? new Date(r.last_receipt).toLocaleDateString("uk-UA") : "—"}</td>
                <td className="px-4 py-2.5 text-right text-[#b9ae9b]">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <SupplierModal
          supplier={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [contact, setContact] = useState(supplier?.contact ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    const body = JSON.stringify({ name, contact, phone, note });
    if (supplier) await fetch(`/api/erp/suppliers/${supplier.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    else await fetch("/api/erp/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    setBusy(false); onSaved();
  }
  async function remove() {
    if (!supplier || !confirm("Видалити постачальника? Приходи збережуться (без прив'язки).")) return;
    await fetch(`/api/erp/suppliers/${supplier.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[6px] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-[15px]">{supplier ? "Постачальник" : "Новий постачальник"}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Назва *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ТОВ Дистриб'юція" className={inp + " mt-1 w-full"} autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Контактна особа</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} className={inp + " mt-1 w-full"} />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Телефон</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp + " mt-1 w-full"} />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#9c8f7d]">Нотатка</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-[3px] border border-[#e2ddd5] bg-white px-3 py-2 text-[13px] focus:border-[#17130f] focus:outline-none" />
          </label>
        </div>
        <div className="mt-5 flex items-center justify-between">
          {supplier ? <button onClick={remove} className="text-[12px] uppercase tracking-wider text-[#9c8f7d] hover:text-red-600">Видалити</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 rounded-[3px] border border-[#e2ddd5] px-4 text-[11px] uppercase tracking-wider text-[#9c8f7d] hover:text-[#17130f]">Скасувати</button>
            <button onClick={save} disabled={!name.trim() || busy} className="h-9 rounded-[3px] bg-[#17130f] px-5 text-[11px] uppercase tracking-wider text-white hover:opacity-85 disabled:opacity-40">{busy ? "…" : "Зберегти"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
