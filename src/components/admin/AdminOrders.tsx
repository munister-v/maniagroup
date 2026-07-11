"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SubTabs } from "./intertop/primitives";

export type AdminOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  date_modified: string;
  payment_method: string;
  billing: { first_name: string; last_name: string; phone: string; email: string };
  shipping_city: string;
  shipping_branch: string;
  comment: string;
  ttn?: string;
  tracking_url?: string;
  source?: string;
  coupon_code?: string;
  discount?: string;
  subtotal: string;
  shipping_cost: string;
  line_items: {
    id: number; product_id: string; name: string; brand: string;
    image_src: string; quantity: number; price: string; total: string;
  }[];
  total: string;
  currency_symbol: string;
};

export const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:    { label: "Очікує оплати", bg: "#fff8e1", color: "#92600a" },
  processing: { label: "В обробці",     bg: "#e3f2fd", color: "#1565c0" },
  "on-hold":  { label: "На утриманні",  bg: "#fff3e0", color: "#bf360c" },
  completed:  { label: "Виконано",      bg: "#e8f5e9", color: "#2e7d32" },
  cancelled:  { label: "Скасовано",     bg: "#ffebee", color: "#c62828" },
  refunded:   { label: "Повернуто",     bg: "#f3e5f5", color: "#6a1b9a" },
};

const STATUS_TABS = [
  { value: "", label: "Всі" },
  { value: "pending", label: "Очікує" },
  { value: "processing", label: "В обробці" },
  { value: "on-hold", label: "Утримано" },
  { value: "completed", label: "Виконано" },
  { value: "cancelled", label: "Скасовано" },
];

const ALL_STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded"];
const PER_PAGE_OPTS = [20, 50, 100];

function uah(v: string | number) {
  return Number(v).toLocaleString("uk-UA") + " ₴";
}

/** Intertop's «Договір» column — the payment terms of the document. */
function contractLabel(paymentMethod: string): string {
  return paymentMethod === "prepay" ? "Передоплата" : "Накладений платіж";
}

export function AdminOrders({ onToast }: { onToast?: (msg: string) => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  // Intertop document-scope tabs: Усі продажі / Замовлення / Повернення.
  // "returns" forces the refunded status; the status chips narrow within the
  // other two scopes.
  const [docScope, setDocScope] = useState<"sales" | "orders" | "returns">("orders");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<"created_at" | "updated_at" | "status" | "total" | "number" | "customer">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [active, setActive] = useState<AdminOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState(ALL_STATUSES[0]);
  const [applyingBulk, setApplyingBulk] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), per_page: String(perPage), sortBy, sortDir });
    const effStatus = docScope === "returns" ? "refunded" : status;
    if (effStatus) params.set("status", effStatus);
    if (search.trim()) params.set("q", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [status, docScope, search, from, to, perPage, sortBy, sortDir]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders?${buildParams(p)}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(1); }, [status, docScope, from, to, perPage, sortBy, sortDir, load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1), 350);
  }

  function toggleSort(key: typeof sortBy) {
    setSortDir((d) => (sortBy === key && d === "asc" ? "desc" : sortBy === key ? "asc" : "desc"));
    setSortBy(key);
  }

  function toggleRow(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  }

  async function applyBulkStatus() {
    if (selected.size === 0) return;
    setApplyingBulk(true);
    try {
      const res = await fetch("/api/admin/orders/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], status: bulkStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        onToast?.(`Оновлено: ${data.count}${data.errors ? `, помилок: ${data.errors}` : ""}`);
        load(page);
      } else {
        onToast?.(data.error ?? "Помилка");
      }
    } finally {
      setApplyingBulk(false);
    }
  }

  async function changeStatus(order: AdminOrder, newStatus: string) {
    const prev = order.status;
    // optimistic
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
    setActive((a) => (a && a.id === order.id ? { ...a, status: newStatus } : a));
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, status: newStatus }),
    });
    if (!res.ok) {
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: prev } : o)));
      onToast?.("Не вдалося змінити статус");
    } else {
      onToast?.(`№${order.number}: ${STATUS_META[newStatus]?.label ?? newStatus}`);
    }
  }

  const sortTh = (key: typeof sortBy, label: string, extraCls = "text-left") => (
    <th className={`whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-[12px] font-semibold text-[#3a4250] ${extraCls}`}>
      <button onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 hover:text-[#2f9488] ${extraCls.includes("right") ? "flex-row-reverse" : ""}`}>
        {label}
        {sortBy === key && <span className="text-[#2f9488]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageFrom = total === 0 ? 0 : (page - 1) * perPage + 1;
  const pageTo = Math.min(page * perPage, total);
  const pageWindow: (number | "…")[] = [];
  {
    const win = new Set([1, totalPages, page, page - 1, page + 1].filter((n) => n >= 1 && n <= totalPages));
    let prev = 0;
    for (let n = 1; n <= totalPages; n++) {
      if (!win.has(n)) continue;
      if (prev && n - prev > 1) pageWindow.push("…");
      pageWindow.push(n); prev = n;
    }
  }

  return (
    <div className="space-y-5">
      {/* Intertop document-scope tabs */}
      <SubTabs
        tabs={[
          { id: "sales", label: "Усі продажі" },
          { id: "orders", label: "Замовлення" },
          { id: "returns", label: "Повернення" },
        ]}
        active={docScope}
        onChange={(id) => setDocScope(id)}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Номер, телефон, імʼя, email…"
            className="h-9 w-72 rounded-[3px] border border-[#e6eaec] bg-white pl-9 pr-3 text-[13px] focus:border-[#2b2d42] focus:outline-none"
          />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#aab4bf]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
        </div>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[#8a94a0]">
          Від
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[#8a94a0]">
          До
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
        </label>
        {(from || to || search) && (
          <button onClick={() => { setFrom(""); setTo(""); setSearch(""); load(1); }}
            className="h-9 rounded-[3px] px-3 text-[11px] uppercase tracking-wider text-[#8a94a0] hover:text-[#2b2d42]">
            Скинути
          </button>
        )}
        <button onClick={() => setCreating(true)}
          className="ml-auto flex h-9 items-center gap-2 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          Створити
        </button>
        <a href={`/api/admin/orders/export?${buildParams(1)}`}
          className="flex h-9 items-center gap-2 rounded-[3px] border border-[#e6eaec] bg-white px-4 text-[11px] uppercase tracking-wider text-[#2b2d42] hover:border-[#2b2d42]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Експорт CSV
        </a>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button key={s.value} onClick={() => setStatus(s.value)}
            className={`h-8 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              status === s.value ? "bg-[#2f9488] text-white" : "border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] hover:text-[#2b2d42]"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Bulk status bar — appears once rows are selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-[#e6eaec] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.1em]">
          <span className="text-[#8a94a0]">Обрано {selected.size}</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
            className="h-8 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] normal-case tracking-normal text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
          </select>
          <button onClick={applyBulkStatus} disabled={applyingBulk}
            className="h-8 rounded-[3px] border border-[#2f9488] px-4 text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
            {applyingBulk ? "…" : "Застосувати"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[3px] bg-[#eef2f3]" />)}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-[3px] border border-[#e6eaec] bg-white px-4 py-14 text-center text-sm text-[#8a94a0]">Замовлень не знайдено</div>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr>
                <th className="w-10 border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === orders.length} onChange={toggleAll}
                    className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити всі" />
                </th>
                <th className="whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]">ID документа</th>
                {sortTh("number", "Номер документа")}
                <th className="whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]">Батьківське замовлення</th>
                <th className="whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]">Тип документа</th>
                <th className="whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]">Договір</th>
                <th className="whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]">Коментар продавця</th>
                {sortTh("status", "Статус документа")}
                {sortTh("created_at", "Дата створення")}
                {sortTh("updated_at", "Дата оновлення")}
                {sortTh("customer", "Покупець")}
                {sortTh("total", "Сума", "text-right")}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const created = new Date(o.date_created).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                const modified = o.date_modified ? new Date(o.date_modified).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
                return (
                  <tr key={o.id} onClick={() => setActive(o)} className={`cursor-pointer border-b border-[#eef2f3] transition-colors ${selected.has(o.id) ? "bg-[#eef7f6]" : "hover:bg-[#f7f9fa]"}`}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleRow(o.id)}
                        className="h-3.5 w-3.5 accent-[#2f9488]" aria-label="Виділити рядок" />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium tabular-nums text-[#5a6472]">{o.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button onClick={(e) => { e.stopPropagation(); setActive(o); }} className="font-mono text-[12px] font-medium text-[#2f9488] hover:underline">{o.number}</button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#8a94a0]">—</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">Замовлення</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#5a6472]">{contractLabel(o.payment_method)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-[#5a6472]" title={o.comment}>{o.comment || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect value={o.status} onChange={(s) => changeStatus(o, s)} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-[#8a94a0]">{created}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] tabular-nums text-[#8a94a0]">{modified}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="text-[13px] text-[#2b2d42]">{o.billing.first_name} {o.billing.last_name}</p>
                      {o.billing.phone && <p className="text-[11px] text-[#8a94a0]">{o.billing.phone}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-[#2b2d42]">{uah(o.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Intertop-style pagination footer */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-[12px] text-[#5a6472]">
          <label className="flex items-center gap-2">
            Відображати на сторінці
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}
              className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
              {PER_PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="tabular-nums text-[#8a94a0]">{pageFrom.toLocaleString("uk-UA")}–{pageTo.toLocaleString("uk-UA")} / {total.toLocaleString("uk-UA")}</span>
          <span className="tabular-nums text-[#8a94a0]">Кількість записів: {total.toLocaleString("uk-UA")}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => load(page - 1)} disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">‹</button>
            {pageWindow.map((p, i) => p === "…"
              ? <span key={`e${i}`} className="px-1 text-[#aab4bf]">…</span>
              : <button key={p} onClick={() => load(p)}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-[4px] border px-2 tabular-nums transition-colors ${p === page ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] bg-white text-[#5a6472] hover:border-[#2f9488] hover:text-[#2f9488]"}`}>{p}</button>)}
            <button onClick={() => load(page + 1)} disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">›</button>
          </div>
        </div>
      )}

      {active && <OrderDrawer order={active} onClose={() => setActive(null)} onStatus={(s) => changeStatus(active, s)}
        onPatched={(patch) => { setActive((a) => a && { ...a, ...patch }); setOrders((os) => os.map((o) => o.id === active.id ? { ...o, ...patch } : o)); }} />}
      {creating && <ManualOrderModal onClose={() => setCreating(false)} onCreated={(num) => { setCreating(false); onToast?.(`Замовлення ${num} створено`); load(1); }} onToast={onToast} />}
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const meta = STATUS_META[value] ?? { label: value, bg: "#f5f5f5", color: "#555" };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ background: meta.bg, color: meta.color }}
      className="cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-7 text-[11px] uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#2b2d42]/30"
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s} style={{ background: "#fff", color: "#2b2d42" }}>{STATUS_META[s]?.label ?? s}</option>
      ))}
    </select>
  );
}

type PickerProduct = { id: string; name: string; brand: string; price: number; image_src: string };
type ManualLine = { product_id: string; name: string; brand: string; image_src: string; price: number; variation: string; quantity: number };

function ManualOrderModal({ onClose, onCreated, onToast }: {
  onClose: () => void;
  onCreated: (number: string) => void;
  onToast?: (m: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [branch, setBranch] = useState("");
  const [comment, setComment] = useState("");
  const [payment, setPayment] = useState<"cod" | "prepay">("cod");
  const [lines, setLines] = useState<ManualLine[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(v: string) {
    setSearch(v);
    if (deb.current) clearTimeout(deb.current);
    if (!v.trim()) { setResults([]); return; }
    deb.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/products?q=${encodeURIComponent(v.trim())}`);
        const data = await res.json();
        setResults((data.products ?? []).slice(0, 8));
      } finally { setSearching(false); }
    }, 300);
  }

  function addProduct(p: PickerProduct) {
    setLines((ls) => {
      const ex = ls.find((l) => l.product_id === p.id && l.variation === "");
      if (ex) return ls.map((l) => l === ex ? { ...l, quantity: l.quantity + 1 } : l);
      return [...ls, { product_id: p.id, name: p.name, brand: p.brand, image_src: p.image_src, price: p.price, variation: "", quantity: 1 }];
    });
    setSearch(""); setResults([]);
  }
  const setLine = (i: number, patch: Partial<ManualLine>) => setLines((ls) => ls.map((l, k) => k === i ? { ...l, ...patch } : l));
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);

  async function submit() {
    if (!firstName.trim() || !phone.trim()) { onToast?.("Вкажіть ім'я та телефон"); return; }
    if (lines.length === 0) { onToast?.("Додайте товар"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/orders/manual", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName, lastName, phone, email, shippingCity: city, shippingBranch: branch,
          comment, paymentMethod: payment,
          items: lines.map((l) => ({ product_id: Number(l.product_id), variation: l.variation, quantity: l.quantity })),
        }),
      });
      const data = await res.json();
      if (res.ok) onCreated(data.number);
      else onToast?.(data.error ?? "Помилка створення");
    } finally { setSaving(false); }
  }

  const inp = "h-9 w-full rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none";

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eef2f3] bg-white px-6 py-4">
          <p className="text-[15px] font-medium text-[#2b2d42]">Нове замовлення вручну</p>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]">✕</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Товари</p>
            <div className="relative">
              <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Пошук товару за назвою / брендом / SKU…" className={inp} />
              {(results.length > 0 || searching) && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-[3px] border border-[#e6eaec] bg-white shadow-lg">
                  {searching && <p className="px-3 py-2 text-[12px] text-[#8a94a0]">Пошук…</p>}
                  {results.map((p) => (
                    <button key={p.id} onClick={() => addProduct(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#f7f9fa]">
                      <div className="h-9 w-7 shrink-0 overflow-hidden bg-[#f7f9fa]">{p.image_src && <img src={p.image_src} alt="" className="h-full w-full object-cover" />}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-[12px] text-[#2b2d42]">{p.name}</p><p className="text-[10px] text-[#8a94a0]">{p.brand} · {uah(p.price)}</p></div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div className="mt-3 divide-y divide-[#eef2f3] rounded-[3px] border border-[#eef2f3]">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    <div className="h-10 w-8 shrink-0 overflow-hidden bg-[#f7f9fa]">{l.image_src && <img src={l.image_src} alt="" className="h-full w-full object-cover" />}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-[#2b2d42]">{l.name}</p>
                      <input value={l.variation} onChange={(e) => setLine(i, { variation: e.target.value })} placeholder="розмір"
                        className="mt-0.5 h-6 w-20 rounded-[2px] border border-[#e6eaec] px-1.5 text-[11px] focus:border-[#2b2d42] focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setLine(i, { quantity: Math.max(1, l.quantity - 1) })} className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42]">−</button>
                      <span className="w-6 text-center text-[12px] tabular-nums">{l.quantity}</span>
                      <button onClick={() => setLine(i, { quantity: l.quantity + 1 })} className="flex h-6 w-6 items-center justify-center rounded-[2px] border border-[#e6eaec] text-[#8a94a0] hover:border-[#2b2d42]">+</button>
                    </div>
                    <span className="w-20 text-right text-[12px] font-medium tabular-nums">{uah(l.price * l.quantity)}</span>
                    <button onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-[#c62828] hover:opacity-70">✕</button>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 text-[13px] font-medium"><span>Разом</span><span className="tabular-nums">{uah(subtotal)}</span></div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Імʼя *" className={inp} />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Прізвище" className={inp} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон *" className={inp} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inp} />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Місто" className={inp} />
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Відділення НП" className={inp} />
            <select value={payment} onChange={(e) => setPayment(e.target.value as "cod" | "prepay")} className={inp}>
              <option value="cod">Накладений платіж</option>
              <option value="prepay">Передоплата</option>
            </select>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Коментар" className={`${inp} col-span-2`} />
          </section>

          <button onClick={submit} disabled={saving}
            className="h-11 w-full rounded-[3px] border border-[#2f9488] text-[12px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-50">
            {saving ? "Створення…" : `Створити замовлення · ${uah(subtotal)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[13px]">
      <span className="w-28 shrink-0 text-[#8a94a0]">{label}</span>
      <span className="text-[#2b2d42]">{children}</span>
    </div>
  );
}

type OrderEvent = { id: number; type: string; message: string; author: string; created_at: string };

function OrderDrawer({ order, onClose, onStatus, onPatched }: {
  order: AdminOrder;
  onClose: () => void;
  onStatus: (s: string) => void;
  onPatched: (patch: Partial<AdminOrder>) => void;
}) {
  const date = new Date(order.date_created).toLocaleString("uk-UA", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const payLabel = order.payment_method === "prepay" ? "Передоплата" : "Накладений платіж";

  const [ttn, setTtn] = useState(order.ttn ?? "");
  const [savingTtn, setSavingTtn] = useState(false);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${order.id}/events`);
    if (res.ok) setEvents((await res.json()).events ?? []);
  }, [order.id]);
  useEffect(() => { loadEvents(); }, [loadEvents]);
  // Refresh the timeline whenever the order status changes from the parent.
  useEffect(() => { loadEvents(); }, [order.status, loadEvents]);

  async function saveTtn() {
    setSavingTtn(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, ttn: ttn.trim() }),
      });
      if (res.ok) {
        const url = ttn.trim() ? `https://novaposhta.ua/tracking/?cargo_number=${ttn.replace(/\D/g, "")}` : "";
        onPatched({ ttn: ttn.trim(), tracking_url: url });
        loadEvents();
      }
    } finally { setSavingTtn(false); }
  }

  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/events`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) { setNote(""); setEvents((await res.json()).events ?? []); }
    } finally { setSavingNote(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eef2f3] bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-[15px] font-medium text-[#2b2d42]">{order.number}</p>
              {order.source === "manual" && <span className="rounded-full bg-[#ede7f6] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#6a1b9a]">Вручну</span>}
            </div>
            <p className="text-[11px] text-[#8a94a0]">{date}</p>
          </div>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]">✕</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Статус</p>
            <StatusSelect value={order.status} onChange={onStatus} />
          </div>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#8a94a0]">Покупець</p>
            <DrawerRow label="Імʼя">{order.billing.first_name} {order.billing.last_name}</DrawerRow>
            <DrawerRow label="Телефон"><a href={`tel:${order.billing.phone}`} className="underline underline-offset-2">{order.billing.phone || "—"}</a></DrawerRow>
            <DrawerRow label="Email">{order.billing.email || "—"}</DrawerRow>
          </section>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#8a94a0]">Доставка · Нова Пошта</p>
            <DrawerRow label="Місто">{order.shipping_city || "—"}</DrawerRow>
            <DrawerRow label="Відділення">{order.shipping_branch || "—"}</DrawerRow>
            <DrawerRow label="Оплата">{payLabel}</DrawerRow>
            {order.comment && <DrawerRow label="Коментар">{order.comment}</DrawerRow>}
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">ТТН Нової Пошти</p>
            <div className="flex items-center gap-2">
              <input value={ttn} onChange={(e) => setTtn(e.target.value)} placeholder="20 4500 0000 0000"
                className="h-9 flex-1 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] tracking-wide focus:border-[#2b2d42] focus:outline-none" />
              <button onClick={saveTtn} disabled={savingTtn || ttn.trim() === (order.ttn ?? "")}
                className="h-9 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                {savingTtn ? "…" : "Зберегти"}
              </button>
            </div>
            {order.tracking_url && (
              <a href={order.tracking_url} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#1565c0] hover:underline">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10 14L21 3m0 0h-6m6 0v6M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Відстежити на novaposhta.ua
              </a>
            )}
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Товари ({order.line_items.length})</p>
            <div className="divide-y divide-[#eef2f3] rounded-[3px] border border-[#eef2f3]">
              {order.line_items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-12 w-9 shrink-0 overflow-hidden bg-[#f7f9fa]">
                    {it.image_src && <img src={it.image_src} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[#2b2d42]">{it.name}</p>
                    <p className="text-[11px] text-[#8a94a0]">{it.brand} · {uah(it.price)} × {it.quantity}</p>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums">{uah(it.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[3px] bg-[#f7f9fa] px-4 py-3 text-[13px]">
            <div className="flex justify-between py-0.5 text-[#8a94a0]"><span>Сума товарів</span><span className="tabular-nums">{uah(order.subtotal)}</span></div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between py-0.5 text-[#2e7d32]"><span>Знижка{order.coupon_code ? ` · ${order.coupon_code}` : ""}</span><span className="tabular-nums">−{uah(order.discount as string)}</span></div>
            )}
            <div className="flex justify-between py-0.5 text-[#8a94a0]"><span>Доставка</span><span className="tabular-nums">{Number(order.shipping_cost) > 0 ? uah(order.shipping_cost) : "за тарифами НП"}</span></div>
            <div className="mt-1 flex justify-between border-t border-[#eef2f3] pt-2 text-[15px] font-medium text-[#2b2d42]"><span>Разом</span><span className="tabular-nums">{uah(order.total)}</span></div>
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Історія та нотатки</p>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Додати внутрішню нотатку…"
                className="h-9 flex-1 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
              <button onClick={addNote} disabled={savingNote || !note.trim()}
                className="h-9 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                {savingNote ? "…" : "Додати"}
              </button>
            </div>
            <ul className="mt-3 space-y-2.5">
              {events.length === 0 && <li className="text-[12px] text-[#aab4bf]">Подій ще немає</li>}
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ev.type === "note" ? "bg-[#2b2d42]" : ev.type === "status" ? "bg-[#1565c0]" : ev.type === "ttn" ? "bg-[#2e7d32]" : "bg-[#aab4bf]"}`} />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-snug text-[#2b2d42]">{ev.message}</p>
                    <p className="text-[10px] text-[#8a94a0]">
                      {new Date(ev.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {ev.author && ev.author !== "system" ? ` · ${ev.author}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
