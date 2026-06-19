"use client";

import { useCallback, useEffect, useState } from "react";

/* ── types ──────────────────────────────────────────────────────────────── */

type PoStatus = "draft" | "sent" | "received" | "cancelled";
type PurchaseOrder = {
  id: number; supplier_id: number | null; supplier: string; status: PoStatus;
  note: string; expected_at: string | null; receipt_id: number | null;
  created_at: string; sent_at: string | null; received_at: string | null;
};
type PoListRow = PurchaseOrder & { items: number; units: number; total: number };
type PoItem = {
  id: number; product_id: number; variant_id: number | null;
  size: string; name: string; brand: string; qty: number; unit_cost: number;
};

function uah(v: number) { return Math.round(v).toLocaleString("uk-UA") + " ₴"; }
function today() { return new Date().toISOString().slice(0, 10); }
const inp = "h-9 rounded-[3px] border border-[#E0E0E0] bg-white px-3 text-[13px] focus:border-[#007B6E] focus:outline-none";

const STATUS_META: Record<PoStatus, { label: string; cls: string }> = {
  draft:     { label: "Чернетка",  cls: "bg-amber-50 text-amber-800" },
  sent:      { label: "Відправлено", cls: "bg-blue-50 text-blue-800" },
  received:  { label: "Отримано",  cls: "bg-green-50 text-green-800" },
  cancelled: { label: "Скасовано", cls: "bg-[#EEEEEE] text-[#9E9E9E]" },
};

/* ── root ───────────────────────────────────────────────────────────────── */

export function ErpPurchasing() {
  const [openId, setOpenId] = useState<number | null>(null);
  return openId
    ? <PoCard id={openId} onBack={() => setOpenId(null)} />
    : <PoList onOpen={setOpenId} />;
}

/* ── list ───────────────────────────────────────────────────────────────── */

type SupplierOpt = { id: number; name: string };

function PoList({ onOpen }: { onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<PoListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | PoStatus>("");
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierText, setSupplierText] = useState("");
  const [expected, setExpected] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    fetch(`/api/erp/purchase-orders${qs}`).then((r) => r.json()).then((d) => setRows(d.orders ?? [])).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/erp/suppliers").then((r) => r.json()).then((d) => setSuppliers(d.suppliers ?? [])).catch(() => {}); }, []);

  async function create() {
    const body: Record<string, unknown> = {};
    if (supplierId) body.supplier_id = Number(supplierId);
    else if (supplierText.trim()) body.supplier = supplierText.trim();
    if (expected) body.expected_at = expected;
    const d = await fetch("/api/erp/purchase-orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then((r) => r.json());
    if (d.id) onOpen(d.id);
  }

  const FILTERS: ("" | PoStatus)[] = ["", "draft", "sent", "received", "cancelled"];

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-5">
      <div>
        <h1 className="text-[20px] font-light tracking-tight">Замовлення постачальнику</h1>
        <p className="text-[12px] text-[#9E9E9E]">План закупівлі → відправка → отримання автоматично створює прихід (залишок + собівартість).</p>
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
          <span className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">Очікувана поставка</span>
          <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className={inp} />
        </label>
        <button onClick={create} className="h-9 rounded-[3px] bg-[#007B6E] px-5 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85">Нове замовлення</button>
      </div>

      <div className="flex flex-wrap gap-1 text-[12px]">
        {FILTERS.map((f) => (
          <button key={f || "all"} onClick={() => setFilter(f)}
            className={`rounded-[3px] px-3 py-1.5 ${filter === f ? "bg-[#007B6E] text-white" : "bg-[#EEEEEE] text-[#616161] hover:bg-[#EEEEEE]"}`}>
            {f === "" ? "Усі" : STATUS_META[f].label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">№</th>
              <th className="px-4 py-3 text-left">Створено</th>
              <th className="px-4 py-3 text-left">Постачальник</th>
              <th className="px-4 py-3 text-left">Очікується</th>
              <th className="px-4 py-3 text-right">Позицій</th>
              <th className="px-4 py-3 text-right">Одиниць</th>
              <th className="px-4 py-3 text-right">Сума</th>
              <th className="px-4 py-3 text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {loading && !rows.length && <tr><td colSpan={8} className="py-12 text-center text-[12px] text-[#9E9E9E]">Завантаження…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-[12px] text-[#9E9E9E]">Замовлень ще немає</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5 font-mono text-[12px] text-[#9E9E9E]">#{r.id}</td>
                <td className="px-4 py-2.5">{new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
                <td className="px-4 py-2.5">{r.supplier || "—"}</td>
                <td className="px-4 py-2.5 text-[#9E9E9E]">{r.expected_at ? new Date(r.expected_at).toLocaleDateString("uk-UA") : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.items}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.units}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{uah(r.total)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_META[r.status].cls}`}>
                    {STATUS_META[r.status].label}
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

/* ── PO card (line editor + lifecycle) ──────────────────────────────────── */

type ProdHit = { id: string; name: string; brand: string; sku: string };
type Variant = { id: number; size: string; stock_qty: number };

function PoCard({ id, onBack }: { id: number; onBack: () => void }) {
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<PoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // line-add picker
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ProdHit[]>([]);
  const [picked, setPicked] = useState<ProdHit | null>(null);
  const [pickedCost, setPickedCost] = useState(0);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/erp/purchase-orders/${id}`).then((r) => r.json()).then((d) => { setPo(d.po); setItems(d.items ?? []); }).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/erp/products?q=${encodeURIComponent(search)}`).then((r) => r.json()).then((d) => setHits((d.products ?? []).slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function pickProduct(p: ProdHit) {
    setPicked(p); setSearch(""); setHits([]); setVariantId(null);
    const d = await fetch(`/api/erp/product/${p.id}`).then((r) => r.json());
    setVariants(d.variants ?? []);
    setPickedCost(Number(d.product?.cost_price) || 0);
    setCost(d.product?.cost_price ? String(Math.round(Number(d.product.cost_price))) : "");
    if (d.variants?.length) setVariantId(d.variants[0].id);
  }

  async function act(body: Record<string, unknown>) {
    setErr(""); setMsg("");
    const r = await fetch(`/api/erp/purchase-orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error ?? "Помилка"); return null; }
    if (d.po) { setPo(d.po); setItems(d.items ?? []); }
    return d;
  }

  async function addLine() {
    if (!variantId || !Number(qty)) return;
    const d = await act({ action: "addItem", variantId, qty: Number(qty), unitCost: Number(cost) || 0 });
    if (d) { setPicked(null); setPickedCost(0); setVariants([]); setVariantId(null); setQty("1"); setCost(""); }
  }

  if (loading && !po) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Завантаження…</div>;
  if (!po) return <div className="p-8 text-center text-[12px] text-[#9E9E9E]">Не знайдено</div>;

  const editable = po.status === "draft";
  const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const units = items.reduce((s, i) => s + i.qty, 0);
  const meta = STATUS_META[po.status];

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-5">
      <button onClick={onBack} className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-[#007B6E]">‹ До списку</button>

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#E0E0E0] bg-white p-4">
        <div>
          <h1 className="text-[17px]">Замовлення #{po.id}
            <span className={`ml-3 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
          </h1>
          <p className="mt-1 text-[12px] text-[#9E9E9E]">
            {po.supplier || "Без постачальника"}
            {po.expected_at && <> · очікується {new Date(po.expected_at).toLocaleDateString("uk-UA")}</>}
            {po.receipt_id && <> · прихід #{po.receipt_id}</>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[20px] font-light tabular-nums">{uah(total)}</p>
          <p className="text-[10px] uppercase tracking-wider text-[#9E9E9E]">{units} од · {items.length} поз</p>
        </div>
      </div>

      {err && <div className="rounded-[3px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{err}</div>}
      {msg && <div className="rounded-[3px] border border-green-200 bg-green-50 px-3 py-2 text-[12px] text-green-700">{msg}</div>}

      {/* line add (draft only) */}
      {editable && (
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
                <button onClick={() => { setPicked(null); setVariants([]); }} className="text-[#BDBDBD] hover:text-red-600">✕</button>
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
                  <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={pickedCost ? String(Math.round(pickedCost)) : "0"} className={inp + " w-32"} />
                </label>
                <button onClick={addLine} disabled={!variantId || !Number(qty)} className="h-9 rounded-[3px] bg-[#007B6E] px-4 text-[11px] uppercase tracking-[0.1em] text-white hover:opacity-85 disabled:opacity-40">Додати</button>
              </div>
              {variants.length === 0 && <p className="text-[11px] text-amber-600">У товару ще немає розмірів — заведіть їх у картці товару, щоб замовляти.</p>}
            </div>
          )}
        </div>
      )}

      {/* lines */}
      <div className="overflow-x-auto rounded-[4px] border border-[#E0E0E0] bg-white">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead>
            <tr className="border-b border-[#EEEEEE] text-[10px] uppercase tracking-wider text-[#9E9E9E]">
              <th className="px-4 py-3 text-left">Товар</th>
              <th className="px-4 py-3 text-left">Бренд</th>
              <th className="px-4 py-3 text-center">Розмір</th>
              <th className="px-4 py-3 text-right">К-сть</th>
              <th className="px-4 py-3 text-right">Закупка/од</th>
              <th className="px-4 py-3 text-right">Сума</th>
              {editable && <th className="px-4 py-3 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAFAFA]">
            {items.length === 0 && <tr><td colSpan={editable ? 7 : 6} className="py-8 text-center text-[12px] text-[#9E9E9E]">Позицій немає</td></tr>}
            {items.map((it) => (
              <tr key={it.id} className="hover:bg-[#FAFAFA]">
                <td className="px-4 py-2.5">{it.name}</td>
                <td className="px-4 py-2.5 text-[#9E9E9E]">{it.brand}</td>
                <td className="px-4 py-2.5 text-center">{it.size}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{it.qty}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{uah(it.unit_cost)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{uah(it.qty * it.unit_cost)}</td>
                {editable && (
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => act({ action: "deleteItem", itemId: it.id })} className="text-[#BDBDBD] hover:text-red-600">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* lifecycle actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          {(po.status === "draft" || po.status === "cancelled") && (
            <button
              onClick={async () => { if (confirm("Видалити замовлення?")) { await fetch(`/api/erp/purchase-orders/${id}`, { method: "DELETE" }); onBack(); } }}
              className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-red-600">Видалити</button>
          )}
          {(po.status === "draft" || po.status === "sent") && (
            <button onClick={() => { if (confirm("Скасувати замовлення?")) act({ action: "cancel" }); }}
              className="text-[12px] uppercase tracking-[0.1em] text-[#9E9E9E] hover:text-red-600">Скасувати</button>
          )}
        </div>
        <div className="flex gap-3">
          {po.status === "draft" && (
            <button onClick={() => act({ action: "send" })} disabled={items.length === 0}
              className="h-10 rounded-[3px] border border-[#007B6E] px-6 text-[11px] uppercase tracking-[0.12em] text-[#212121] hover:bg-[#007B6E] hover:text-white disabled:opacity-40">
              Відправити постачальнику
            </button>
          )}
          {(po.status === "draft" || po.status === "sent") && (
            <button
              onClick={async () => {
                if (!items.length) return;
                if (confirm("Отримати замовлення? Створиться прихід, залишки та собівартість оновляться.")) {
                  const d = await act({ action: "receive" });
                  if (d?.receiptId) setMsg(`Отримано · створено прихід #${d.receiptId}, залишки оновлено`);
                }
              }}
              disabled={items.length === 0}
              className="h-10 rounded-[3px] bg-[#007B6E] px-6 text-[11px] uppercase tracking-[0.12em] text-white hover:opacity-85 disabled:opacity-40">
              Отримати (→ прихід)
            </button>
          )}
        </div>
      </div>
      {po.status === "received" && (
        <p className="text-center text-[12px] text-green-700">
          Отримано {po.received_at ? new Date(po.received_at).toLocaleString("uk-UA") : ""}
          {po.receipt_id && <> · прихід #{po.receipt_id} проведено</>}
        </p>
      )}
    </div>
  );
}
