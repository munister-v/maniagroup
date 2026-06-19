"use client";

import { useCallback, useEffect, useState } from "react";

type ReturnRow = {
  id: string; order_number: string; status: string;
  reason: string; total: string; item_count: number;
  created_at: string; resolved_at: string | null;
};
type ReturnItem = {
  id: string; name: string; size: string; qty: number; price: string; action: string;
};
type ReturnDetail = { return: ReturnRow; items: ReturnItem[] };

const STATUS_LABEL: Record<string, string> = {
  pending: "Очікує", received: "Отримано", refunded: "Повернено", exchanged: "Обмін", rejected: "Відхилено",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600", received: "text-blue-600",
  refunded: "text-green-700", exchanged: "text-purple-600", rejected: "text-red-600",
};
const ACTION_LABEL: Record<string, string> = { refund: "Повернення коштів", exchange: "Обмін", store_credit: "Кредит" };

function uah(n: number) { return Math.round(n).toLocaleString("uk-UA") + " ₴"; }
function dmy(s: string) { return s ? new Date(s).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"; }

const btn = "h-9 px-4 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors";
const teal = btn + " bg-[#007B6E] text-white hover:bg-[#006B5E]";
const ghost = btn + " border border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E] hover:text-[#007B6E]";
const inp = "h-9 border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

export function ErpReturns() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ReturnDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ perPage: "50" });
    if (statusFilter) sp.set("status", statusFilter);
    fetch(`/api/erp/returns?${sp}`)
      .then((r) => r.json())
      .then((d) => { setReturns(d.returns ?? []); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: string) {
    const r = await fetch(`/api/erp/returns/${id}`);
    setDetail(await r.json());
  }
  async function updateStatus(id: string, status: string) {
    await fetch(`/api/erp/returns/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setDetail(null); load();
  }

  if (creating) return <CreateReturn onDone={() => { setCreating(false); load(); }} />;
  if (detail) return <ReturnCard detail={detail} onBack={() => setDetail(null)} onUpdateStatus={updateStatus} />;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-normal text-[#212121]">Повернення</h1>
          <p className="text-[13px] text-[#9E9E9E]">{total} записів</p>
        </div>
        <button onClick={() => setCreating(true)} className={teal}>
          + Нове повернення
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["", "pending", "received", "refunded", "exchanged", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
              statusFilter === s ? "border-[#007B6E] bg-[#007B6E] text-white" : "border-[#E0E0E0] bg-white text-[#616161] hover:border-[#007B6E]"
            }`}>
            {s === "" ? "Усі" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="border border-[#E0E0E0] bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E0E0E0] text-[11px] font-medium text-[#9E9E9E]">
              <th className="px-4 py-3 text-left font-normal">№ замовлення</th>
              <th className="px-4 py-3 text-left font-normal">Причина</th>
              <th className="px-4 py-3 text-left font-normal">Статус</th>
              <th className="px-4 py-3 text-right font-normal">Сума</th>
              <th className="px-4 py-3 text-left font-normal">Дата</th>
              <th className="px-4 py-3 text-center font-normal">Позицій</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {loading && <tr><td colSpan={6} className="py-10 text-center text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && !returns.length && <tr><td colSpan={6} className="py-10 text-center text-[#9E9E9E]">Повернень ще немає</td></tr>}
            {returns.map((r) => (
              <tr key={r.id} onClick={() => loadDetail(r.id)} className="cursor-pointer hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5 font-medium text-[#007B6E]">#{r.order_number || r.id}</td>
                <td className="px-4 py-2.5 text-[#424242] max-w-[200px] truncate">{r.reason || "—"}</td>
                <td className={`px-4 py-2.5 font-medium ${STATUS_COLOR[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{uah(Number(r.total))}</td>
                <td className="px-4 py-2.5 text-[#9E9E9E]">{dmy(r.created_at)}</td>
                <td className="px-4 py-2.5 text-center">{r.item_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReturnCard({ detail, onBack, onUpdateStatus }: {
  detail: ReturnDetail;
  onBack: () => void;
  onUpdateStatus: (id: string, s: string) => void;
}) {
  const { return: ret, items } = detail;
  const nextStatuses: Record<string, string[]> = {
    pending: ["received", "rejected"],
    received: ["refunded", "exchanged"],
  };

  return (
    <div className="mx-auto max-w-[900px] p-5">
      <button onClick={onBack} className="mb-3 text-[13px] font-medium uppercase text-[#9E9E9E] hover:text-[#007B6E]">‹ До списку</button>
      <div className="border border-[#E0E0E0] bg-white p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-[18px] text-[#212121]">Повернення #{ret.order_number || ret.id}</h2>
            <p className={`text-[14px] font-medium mt-1 ${STATUS_COLOR[ret.status] ?? ""}`}>{STATUS_LABEL[ret.status]}</p>
            {ret.reason && <p className="text-[13px] text-[#424242] mt-1">{ret.reason}</p>}
          </div>
          <div className="flex gap-2">
            {(nextStatuses[ret.status] ?? []).map((s) => (
              <button key={s} onClick={() => onUpdateStatus(ret.id, s)}
                className={s === "rejected" ? ghost : teal}>
                → {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#F5F5F5] text-[11px] text-[#9E9E9E]">
              <th className="py-2 text-left font-normal">Товар</th>
              <th className="py-2 text-center font-normal">Розмір</th>
              <th className="py-2 text-center font-normal">Кількість</th>
              <th className="py-2 text-right font-normal">Ціна</th>
              <th className="py-2 text-left font-normal">Дія</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 text-[#212121]">{item.name}</td>
                <td className="py-2 text-center text-[#9E9E9E]">{item.size || "—"}</td>
                <td className="py-2 text-center">{item.qty}</td>
                <td className="py-2 text-right tabular-nums">{uah(Number(item.price))}</td>
                <td className="py-2 text-[#424242]">{ACTION_LABEL[item.action] ?? item.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 text-right font-semibold text-[#212121]">Разом: {uah(Number(ret.total))}</div>
      </div>
    </div>
  );
}

function CreateReturn({ onDone }: { onDone: () => void }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([{ name: "", size: "", qty: 1, price: 0, action: "refund" }]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const validItems = items.filter((i) => i.name.trim());
    if (!validItems.length) return;
    setSaving(true);
    const total = validItems.reduce((s, i) => s + i.price * i.qty, 0);
    await fetch("/api/erp/returns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_number: orderNumber, reason, note, total, items: validItems }),
    });
    setSaving(false); onDone();
  }

  const addItem = () => setItems((prev) => [...prev, { name: "", size: "", qty: 1, price: 0, action: "refund" }]);
  const updItem = (i: number, field: string, val: string | number) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  return (
    <div className="mx-auto max-w-[800px] p-5">
      <button onClick={onDone} className="mb-3 text-[13px] font-medium uppercase text-[#9E9E9E] hover:text-[#007B6E]">‹ Скасувати</button>
      <h2 className="mb-4 text-[20px] text-[#212121]">Нове повернення</h2>
      <div className="space-y-4 border border-[#E0E0E0] bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">№ замовлення</span>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className={inp + " w-full"} /></label>
          <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Причина повернення</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inp + " w-full"} /></label>
        </div>
        <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase text-[#9E9E9E]">Нотатка</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            className="w-full resize-none border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] focus:border-[#007B6E] focus:outline-none" /></label>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase text-[#9E9E9E]">Позиції повернення</p>
          <table className="w-full text-[13px]">
            <thead><tr className="text-[11px] text-[#9E9E9E]">
              <th className="pb-1 text-left font-normal">Назва товару</th>
              <th className="pb-1 text-center font-normal w-16">Розмір</th>
              <th className="pb-1 text-center font-normal w-16">Кількість</th>
              <th className="pb-1 text-right font-normal w-24">Ціна ₴</th>
              <th className="pb-1 text-left font-normal w-32">Дія</th>
            </tr></thead>
            <tbody className="divide-y divide-[#F5F5F5]">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><input value={item.name} onChange={(e) => updItem(i, "name", e.target.value)} className={inp + " w-full"} placeholder="Назва…" /></td>
                  <td className="py-1 px-1"><input value={item.size} onChange={(e) => updItem(i, "size", e.target.value)} className={inp + " w-16 text-center"} /></td>
                  <td className="py-1 px-1"><input type="number" min={1} value={item.qty} onChange={(e) => updItem(i, "qty", Number(e.target.value))} className={inp + " w-16 text-center"} /></td>
                  <td className="py-1 px-1"><input type="number" min={0} value={item.price} onChange={(e) => updItem(i, "price", Number(e.target.value))} className={inp + " w-24 text-right"} /></td>
                  <td className="py-1 pl-1">
                    <select value={item.action} onChange={(e) => updItem(i, "action", e.target.value)} className={inp + " w-32"}>
                      <option value="refund">Повернення</option>
                      <option value="exchange">Обмін</option>
                      <option value="store_credit">Кредит</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addItem} className="mt-2 text-[12px] text-[#007B6E] hover:underline">+ Додати позицію</button>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-[#F5F5F5]">
          <button onClick={onDone} className={ghost}>Скасувати</button>
          <button onClick={save} disabled={saving} className={teal}>{saving ? "Збереження…" : "Зберегти"}</button>
        </div>
      </div>
    </div>
  );
}
