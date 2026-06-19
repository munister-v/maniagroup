"use client";

import { useCallback, useEffect, useState } from "react";

/* ── types ──────────────────────────────────────────────────────────────── */

type Receipt = {
  id: number; supplier: string; doc_date: string; note: string;
  status: "draft" | "posted"; created_at: string; posted_at: string | null;
};
type ReceiptListRow = Receipt & { items: number; units: number; total: number };
type ReceiptItem = {
  id: number; product_id: number; variant_id: number | null;
  size: string; name: string; qty: number; unit_cost: number;
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function today() { return new Date().toISOString().slice(0, 10); }
const inp = "h-9 rounded-[3px] border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

/** Live margin preview: retail price vs the cost being entered. */
function MarginHint({ retail, cost }: { retail: number; cost: number }) {
  const profit = retail - cost;
  const marginPct = retail > 0 ? (profit / retail) * 100 : 0;     // частка прибутку в ціні
  const markupPct = cost > 0 ? (profit / cost) * 100 : 0;          // націнка від закупки
  const good = marginPct >= 40, bad = profit < 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[3px] bg-[#FAFAFA] px-3 py-2 text-[12px]">
      <span className="text-[#9E9E9E]">Роздріб: <b className="text-[#212121] tabular-nums">{uah(retail)}</b></span>
      {cost > 0 ? (
        <>
          <span className="text-[#9E9E9E]">Прибуток/од: <b className={`tabular-nums ${bad ? "text-red-600" : "text-green-700"}`}>{uah(profit)}</b></span>
          <span className="text-[#9E9E9E]">Маржа: <b className={`tabular-nums ${bad ? "text-red-600" : good ? "text-green-700" : "text-amber-600"}`}>{marginPct.toFixed(0)}%</b></span>
          <span className="text-[#9E9E9E]">Націнка: <b className="tabular-nums text-[#212121]">{markupPct.toFixed(0)}%</b></span>
          {bad && <span className="text-[11px] text-red-600">⚠ закупка вища за роздріб</span>}
        </>
      ) : (
        <span className="text-[11px] text-[#BDBDBD]">Введіть закупку — побачите маржу</span>
      )}
    </div>
  );
}

/* ── root ───────────────────────────────────────────────────────────────── */

export function ErpReceiving() {
  const [openId, setOpenId] = useState<number | null>(null);
  return openId
    ? <ReceiptCard id={openId} onBack={() => setOpenId(null)} />
    : <ReceiptList onOpen={setOpenId} />;
}

/* ── list ───────────────────────────────────────────────────────────────── */

type SupplierOpt = { id: number; name: string };

function ReceiptList({ onOpen }: { onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<ReceiptListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierId, setSupplierId] = useState("");
  const [supplierText, setSupplierText] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [date, setDate] = useState(today());

  // D3 — прихід з файлу
  const [fileOpen, setFileOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [costCol, setCostCol] = useState<"base" | "discount">("base");
  const [filePreview, setFilePreview] = useState<{ matched: { name: string; size: string; qty: number; unitCost: number }[]; totalUnits: number; totalCost: number; unmatched: unknown[]; ai: boolean; kind: string } | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileErr, setFileErr] = useState("");

  async function fileRequest(mode: "preview" | "apply") {
    if (!file) return;
    setFileBusy(true); setFileErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    fd.append("costCol", costCol);
    if (supplierId) fd.append("supplierId", supplierId);
    else if (supplierText.trim()) fd.append("note", `Імпорт накладної (${supplierText.trim()})`);
    try {
      const r = await fetch("/api/erp/receipts/from-file", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) { setFileErr(d.error ?? "Помилка"); return; }
      if (mode === "preview") setFilePreview(d.preview);
      else if (d.receiptId) onOpen(d.receiptId); // open the created draft
    } catch {
      setFileErr("Не вдалося обробити файл");
    } finally {
      setFileBusy(false);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/erp/receipts").then((r) => r.json()).then((d) => setRows(d.receipts ?? [])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/erp/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? [])).catch(() => {}); }, []);

  async function create() {
    const body: Record<string, unknown> = { doc_date: date };
    if (supplierId) body.supplier_id = Number(supplierId);
    else if (supplierText.trim()) body.supplier = supplierText.trim();
    const r = await fetch("/api/erp/receipts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.id) onOpen(d.id);
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Прихід товару</h1>
        <p className="text-[12px] text-[#9E9E9E]">Прихідні документи додають залишок і задають закупочну ціну → собівартість для фінансів.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Постачальник</span>
          {suppliers.length > 0 ? (
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inp + " w-60 pr-7"}>
              <option value="">— без постачальника —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <input value={supplierText} onChange={(e) => setSupplierText(e.target.value)} placeholder="напр. ТОВ Дистриб'юція" className={inp + " w-60"} />
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Дата</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
        </label>
        <button onClick={create} className="h-9 rounded-[3px] bg-[#007B6E] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85">Новий прихід</button>
        <button onClick={() => setFileOpen((o) => !o)} className="h-9 rounded-[3px] border border-[#007B6E] px-5 text-[11px] uppercase tracking-[0.12em] text-[#007B6E] hover:bg-[#007B6E]/5">
          {fileOpen ? "▲ Прихід з файлу" : "↑ Прихід з файлу"}
        </button>
        {suppliers.length === 0 && <span className="self-center text-[11px] text-[#BDBDBD]">Додайте постачальників у вкладці «Постачальники» для аналітики</span>}
      </div>

      {/* ── D3: прихід з накладної (файл) ── */}
      {fileOpen && (
        <div className="space-y-3 rounded-[4px] border border-[#007B6E]/30 bg-[#F1F9F8] p-4">
          <p className="text-[12px] text-[#616161]">
            Завантажте накладну постачальника (.xls / .csv / .xlsx — ті ж формати, що й імпорт товарів).
            Система зіставить позиції з каталогом, ціна стане закупочною. Створиться <b>чернетка приходу</b> —
            перевірте й проведіть її вручну.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" accept=".xls,.xlsx,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFilePreview(null); setFileErr(""); }}
              className="text-[12px] file:mr-3 file:rounded-[3px] file:border-0 file:bg-[#007B6E] file:px-3 file:py-1.5 file:text-[11px] file:uppercase file:tracking-wider file:text-white" />
            <label className="flex items-center gap-2 text-[12px] text-[#616161]">
              Закупочна ціна:
              <select value={costCol} onChange={(e) => { setCostCol(e.target.value as "base" | "discount"); setFilePreview(null); }} className={inp + " w-44 pr-7"}>
                <option value="base">Базова ціна</option>
                <option value="discount">Акційна / нетто</option>
              </select>
            </label>
            <button onClick={() => fileRequest("preview")} disabled={!file || fileBusy}
              className="h-9 rounded-[3px] border border-[#007B6E] px-4 text-[11px] uppercase tracking-[0.1em] text-[#007B6E] hover:bg-[#007B6E]/5 disabled:opacity-40">
              {fileBusy ? "…" : "Перевірити"}
            </button>
          </div>

          {fileErr && <p className="text-[12px] text-red-600">{fileErr}</p>}

          {filePreview && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4 text-[12px]">
                <span>Зіставлено: <b className="tabular-nums">{filePreview.matched.length}</b> позицій</span>
                <span>Одиниць: <b className="tabular-nums">{filePreview.totalUnits.toLocaleString("uk-UA")}</b></span>
                <span>Сума закупки: <b className="tabular-nums">{uah(filePreview.totalCost)}</b></span>
                {filePreview.unmatched.length > 0 && <span className="text-amber-700">Не знайдено: {filePreview.unmatched.length}</span>}
                {filePreview.ai && <span className="rounded-full bg-purple-100 px-2 text-[10px] uppercase tracking-wider text-purple-700">AI-розбір</span>}
              </div>
              {filePreview.matched.length > 0 && (
                <div className="max-h-52 overflow-y-auto rounded-[3px] border border-[#E0E0E0] bg-white">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-[#FAFAFA] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
                      <tr><th className="px-3 py-1.5 text-left">Товар</th><th className="px-3 py-1.5 text-center">Розмір</th><th className="px-3 py-1.5 text-right">К-сть</th><th className="px-3 py-1.5 text-right">Закупка</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#FAFAFA]">
                      {filePreview.matched.slice(0, 100).map((m, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 truncate max-w-[320px]">{m.name}</td>
                          <td className="px-3 py-1.5 text-center text-[#9E9E9E]">{m.size}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{m.qty}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{uah(m.unitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button onClick={() => fileRequest("apply")} disabled={fileBusy || filePreview.matched.length === 0}
                className="h-9 rounded-[3px] bg-[#007B6E] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
                {fileBusy ? "Створення…" : `Створити чернетку приходу (${filePreview.matched.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">№</th>
              <th className="px-4 py-3 text-left">Дата</th>
              <th className="px-4 py-3 text-left">Постачальник</th>
              <th className="px-4 py-3 text-right">Позицій</th>
              <th className="px-4 py-3 text-right">Одиниць</th>
              <th className="px-4 py-3 text-right">Сума</th>
              <th className="px-4 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {loading && !rows.length && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[#9E9E9E]">Приходів ще немає</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#9E9E9E]">#{r.id}</td>
                <td className="px-4 py-2.5">{new Date(r.doc_date).toLocaleDateString("uk-UA")}</td>
                <td className="px-4 py-2.5">{r.supplier || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.items}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.units}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{uah(r.total)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${r.status === "posted" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                    {r.status === "posted" ? "Проведено" : "Чернетка"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── receipt card (line editor + post) ──────────────────────────────────── */

type ProdHit = { id: string; name: string; brand: string; sku: string };
type Variant = { id: number; size: string; stock_qty: number };

function ReceiptCard({ id, onBack }: { id: number; onBack: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // line-add picker
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ProdHit[]>([]);
  const [picked, setPicked] = useState<ProdHit | null>(null);
  const [pickedPrice, setPickedPrice] = useState(0);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/receipts/${id}`).then((r) => r.json()).then((d) => { setReceipt(d.receipt); setItems(d.items ?? []); }).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // product search
  useEffect(() => {
    if (!search.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/erp/products?q=${encodeURIComponent(search)}`).then((r) => r.json()).then((d) => setHits((d.products ?? []).slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function pickProduct(p: ProdHit) {
    setPicked(p); setSearch(""); setHits([]); setVariantId(null); setPickedPrice(0);
    const d = await fetch(`/api/erp/product/${p.id}`).then((r) => r.json());
    setVariants(d.variants ?? []);
    setPickedPrice(Number(d.product?.price) || 0);
    if (d.variants?.length) setVariantId(d.variants[0].id);
  }

  async function act(body: Record<string, unknown>) {
    setErr("");
    const r = await fetch(`/api/erp/receipts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error ?? "Помилка"); return false; }
    if (d.receipt) { setReceipt(d.receipt); setItems(d.items ?? []); }
    return true;
  }

  async function addLine() {
    if (!variantId || !Number(qty)) return;
    const ok = await act({ action: "addItem", variantId, qty: Number(qty), unitCost: Number(cost) || 0 });
    if (ok) { setPicked(null); setPickedPrice(0); setVariants([]); setVariantId(null); setQty("1"); setCost(""); }
  }

  if (loading && !receipt) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Завантаження…</div>;
  if (!receipt) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Не знайдено</div>;

  const posted = receipt.status === "posted";
  const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const units = items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-5">
      <button onClick={onBack} className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-[#007B6E]">‹ До списку</button>

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <div>
          <h1 className="text-[17px]">Прихід #{receipt.id}
            <span className={`ml-3 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${posted ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
              {posted ? "Проведено" : "Чернетка"}
            </span>
          </h1>
          <p className="mt-1 text-[12px] text-[#9E9E9E]">
            {receipt.supplier || "Без постачальника"} · {new Date(receipt.doc_date).toLocaleDateString("uk-UA")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-light tabular-nums">{uah(total)}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">{units} од · {items.length} поз</p>
        </div>
      </div>

      {err && <div className="rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</div>}

      {/* line add (draft only) */}
      {!posted && (
        <div className="rounded-[4px] border border-[#E0E0E0] bg-white p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-wider text-[#9E9E9E]">Додати позицію</h3>
          {!picked ? (
            <div className="relative">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук товару: назва, бренд, артикул…" className={inp + " w-full max-w-md"} />
              {hits.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full max-w-md overflow-y-auto rounded-[3px] border border-[#E0E0E0] bg-white shadow-lg">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => pickProduct(h)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-[#F5F5F5]">
                        <span className="min-w-0 truncate">{h.name}</span>
                        <span className="shrink-0 text-[#9E9E9E]">{h.brand} · {h.sku}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-medium text-[#212121]">{picked.name}</span>
                <span className="text-[#9E9E9E]">{picked.brand} · {picked.sku}</span>
                <button onClick={() => { setPicked(null); setPickedPrice(0); setVariants([]); }} className="text-[#BDBDBD] hover:text-red-600">✕</button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Розмір</span>
                  <select value={variantId ?? ""} onChange={(e) => setVariantId(Number(e.target.value))} className={inp + " pr-7"}>
                    {variants.length === 0 && <option value="">нема розмірів</option>}
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.size} (зараз {v.stock_qty})</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">К-сть</span>
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={inp + " w-24"} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Закупка / од, ₴</span>
                  <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" className={inp + " w-32"} />
                </label>
                <button onClick={addLine} disabled={!variantId || !Number(qty)} className="h-9 rounded-[3px] bg-[#007B6E] px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">Додати</button>
              </div>
              {pickedPrice > 0 && (
                <MarginHint retail={pickedPrice} cost={Number(cost) || 0} />
              )}
            </div>
          )}
        </div>
      )}

      {/* lines */}
      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">Товар</th>
              <th className="px-4 py-3 text-center">Розмір</th>
              <th className="px-4 py-3 text-right">К-сть</th>
              <th className="px-4 py-3 text-right">Закупка/од</th>
              <th className="px-4 py-3 text-right">Сума</th>
              {!posted && <th className="px-4 py-3 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {items.length === 0 && <tr><td colSpan={posted ? 5 : 6} className="py-8 text-center text-[12px] text-[#9E9E9E]">Позицій немає</td></tr>}
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5">{it.name}</td>
                <td className="px-4 py-2.5 text-center">{it.size}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{it.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{uah(it.unit_cost)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{uah(it.qty * it.unit_cost)}</td>
                {!posted && (
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => act({ action: "deleteItem", itemId: it.id })} className="text-[#BDBDBD] hover:text-red-600">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* actions */}
      {!posted && (
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={async () => { if (confirm("Видалити чернетку приходу?")) { await fetch(`/api/erp/receipts/${id}`, { method: "DELETE" }); onBack(); } }}
            className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-red-600">Видалити чернетку</button>
          <button
            onClick={async () => { if (items.length && confirm("Провести прихід? Залишки збільшаться, оновиться собівартість.")) await act({ action: "post" }); }}
            disabled={items.length === 0}
            className="h-10 rounded-[3px] bg-[#007B6E] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
            Провести прихід
          </button>
        </div>
      )}
      {posted && (
        <p className="text-center text-[12px] text-green-700">
          Проведено {receipt.posted_at ? new Date(receipt.posted_at).toLocaleString("uk-UA") : ""} · залишки та собівартість оновлено
        </p>
      )}
    </div>
  );
}
