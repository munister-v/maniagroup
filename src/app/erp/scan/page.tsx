"use client";

import { useEffect, useRef, useState } from "react";

type VariantInfo = {
  variant_id: string; product_id: string; size: string; stock_qty: string;
  barcode: string; name: string; brand: string; sku: string; image_src: string;
};
type ScanResult = { found: boolean; variant?: VariantInfo };
type HistoryEntry = { barcode: string; name: string; size: string; delta: number; newQty: number; time: string };

export default function ScanPage() {
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [delta, setDelta] = useState(1);
  const [adjustType, setAdjustType] = useState<"receipt" | "adjust" | "writeoff">("adjust");
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function lookup(code: string) {
    if (!code.trim()) return;
    setLoading(true); setResult(null); setMsg(""); setDelta(1);
    const r = await fetch(`/api/erp/scan?barcode=${encodeURIComponent(code.trim())}`);
    const d: ScanResult = await r.json();
    setResult(d);
    setLoading(false);
    if (!d.found) setMsg(`Штрихкод «${code}» не знайдено у базі`);
    // Refocus for next scan
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function adjust() {
    if (!result?.variant || delta === 0) return;
    setAdjusting(true);
    const v = result.variant;
    const r = await fetch("/api/erp/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: v.variant_id, productId: v.product_id, size: v.size,
        delta: adjustType === "writeoff" ? -Math.abs(delta) : Math.abs(delta),
        type: adjustType, note: `Сканер · ${adjustType}`,
      }),
    });
    const d = await r.json();
    setAdjusting(false);
    if (d.ok) {
      setMsg(`✓ ${v.name} ${v.size}: залишок ${d.newQty} од.`);
      setHistory((h) => [{
        barcode: v.barcode, name: `${v.brand} ${v.name}`, size: v.size,
        delta: adjustType === "writeoff" ? -Math.abs(delta) : Math.abs(delta),
        newQty: d.newQty, time: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
      }, ...h.slice(0, 19)]);
      setResult((prev) => prev?.variant ? { ...prev, variant: { ...prev.variant, stock_qty: String(d.newQty) } } : prev);
      setBarcode(""); setResult(null);
    } else {
      setMsg("Помилка: " + (d.error ?? "невідома"));
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const v = result?.variant;

  return (
    <div className="min-h-screen bg-[#F5F5F5] p-4">
      <div className="mx-auto max-w-[480px] space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-[18px] font-semibold text-[#212121]">Сканер штрихкодів</h1>
          <a href="/erp" className="text-[12px] text-[#007B6E]">← ERP</a>
        </div>

        {/* Barcode input */}
        <div className="bg-white border border-[#E0E0E0] p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]">
            Штрихкод товару
          </p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup(barcode)}
              placeholder="Скануйте або введіть EAN…"
              inputMode="numeric"
              className="flex-1 h-12 border border-[#E0E0E0] px-3 text-[15px] tabular-nums focus:border-[#007B6E] focus:outline-none"
              autoComplete="off"
            />
            <button onClick={() => lookup(barcode)} disabled={loading || !barcode.trim()}
              className="h-12 bg-[#007B6E] px-5 text-[13px] font-semibold uppercase text-white hover:bg-[#006B5E] disabled:opacity-40 transition-colors">
              {loading ? "…" : "Знайти"}
            </button>
          </div>
          {msg && (
            <p className={`mt-2 text-[13px] ${msg.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>{msg}</p>
          )}
        </div>

        {/* Found product */}
        {result?.found && v && (
          <div className="bg-white border border-[#E0E0E0] p-4">
            <div className="flex gap-3 mb-4">
              {v.image_src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.image_src} alt="" className="h-16 w-16 border border-[#EEEEEE] object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-[#212121] truncate">{v.brand} {v.name}</p>
                <p className="text-[13px] text-[#9E9E9E]">Розмір: <b className="text-[#212121]">{v.size}</b></p>
                <p className="text-[13px] text-[#9E9E9E]">Залишок: <b className={`text-[${Number(v.stock_qty) > 0 ? "#007B6E" : "#D32F2F"}]`}>{v.stock_qty} од.</b></p>
                {v.sku && <p className="text-[11px] text-[#BDBDBD]">SKU: {v.sku}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {(["receipt", "adjust", "writeoff"] as const).map((t) => (
                <button key={t} onClick={() => setAdjustType(t)}
                  className={`py-2 text-[12px] font-semibold uppercase border transition-colors ${
                    adjustType === t ? "border-[#007B6E] bg-[#007B6E] text-white" : "border-[#E0E0E0] bg-white text-[#424242] hover:border-[#007B6E]"
                  }`}>
                  {t === "receipt" ? "Прийняти" : t === "adjust" ? "Коригування" : "Списати"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setDelta((d) => Math.max(1, d - 1))}
                className="h-11 w-11 border border-[#E0E0E0] text-[20px] text-[#212121] hover:border-[#007B6E] transition-colors">−</button>
              <span className="flex-1 text-center text-[22px] font-bold text-[#212121] tabular-nums">
                {adjustType === "writeoff" ? "-" : "+"}{delta}
              </span>
              <button onClick={() => setDelta((d) => d + 1)}
                className="h-11 w-11 border border-[#E0E0E0] text-[20px] text-[#212121] hover:border-[#007B6E] transition-colors">+</button>
            </div>

            <button onClick={adjust} disabled={adjusting}
              className="w-full h-12 bg-[#212121] text-white text-[13px] font-bold uppercase tracking-[0.06em] hover:bg-[#333] disabled:opacity-40 transition-colors">
              {adjusting ? "Збереження…" : `${adjustType === "writeoff" ? "Списати" : adjustType === "receipt" ? "Прийняти" : "Зберегти"} ${delta} од.`}
            </button>
          </div>
        )}

        {result && !result.found && (
          <div className="bg-white border border-[#E0E0E0] p-4 text-center">
            <p className="text-[15px] text-[#9E9E9E] mb-3">Штрихкод не знайдено</p>
            <p className="text-[12px] text-[#BDBDBD]">Переконайтесь що варіант товару додано в ERP і штрихкод заповнено в Торгових пропозиціях.</p>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white border border-[#E0E0E0]">
            <p className="border-b border-[#F5F5F5] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#9E9E9E]">
              Журнал сесії
            </p>
            <ul className="divide-y divide-[#F5F5F5] max-h-[300px] overflow-y-auto">
              {history.map((h, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-medium text-[#212121] truncate">{h.name} <span className="text-[#9E9E9E]">/ {h.size}</span></p>
                    <p className="text-[11px] text-[#9E9E9E]">{h.time}</p>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className={`font-semibold tabular-nums ${h.delta > 0 ? "text-green-700" : "text-red-600"}`}>
                      {h.delta > 0 ? "+" : ""}{h.delta}
                    </p>
                    <p className="text-[11px] text-[#9E9E9E]">→ {h.newQty} од.</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-center text-[11px] text-[#BDBDBD]">
          Підключіть USB-сканер — він автоматично підставить штрихкод в поле вище.
        </p>
      </div>
    </div>
  );
}
