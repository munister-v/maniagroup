"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AdminOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  payment_method: string;
  billing: { first_name: string; last_name: string; phone: string; email: string };
  shipping_city: string;
  shipping_branch: string;
  comment: string;
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
const PER_PAGE = 20;

function uah(v: string | number) {
  return Number(v).toLocaleString("uk-UA") + " ₴";
}

export function AdminOrders({ onToast }: { onToast?: (msg: string) => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<AdminOrder | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) });
    if (status) params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [status, search, from, to]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders?${buildParams(p)}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(1); }, [status, from, to, load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1), 350);
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

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Номер, телефон, імʼя, email…"
            className="h-9 w-72 rounded-[3px] border border-[#e8e4de] bg-white pl-9 pr-3 text-[13px] focus:border-[#17130f] focus:outline-none"
          />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#b9ae9b]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
        </div>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[#9c8f7d]">
          Від
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[13px] focus:border-[#17130f] focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-[#9c8f7d]">
          До
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-[3px] border border-[#e8e4de] bg-white px-2 text-[13px] focus:border-[#17130f] focus:outline-none" />
        </label>
        {(from || to || search) && (
          <button onClick={() => { setFrom(""); setTo(""); setSearch(""); load(1); }}
            className="h-9 rounded-[3px] px-3 text-[11px] uppercase tracking-wider text-[#9c8f7d] hover:text-[#17130f]">
            Скинути
          </button>
        )}
        <a href={`/api/admin/orders/export?${buildParams(1)}`}
          className="ml-auto flex h-9 items-center gap-2 rounded-[3px] border border-[#e8e4de] bg-white px-4 text-[11px] uppercase tracking-wider text-[#17130f] hover:border-[#17130f]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Експорт CSV
        </a>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((s) => (
          <button key={s.value} onClick={() => setStatus(s.value)}
            className={`h-8 rounded-[3px] px-4 text-[11px] uppercase tracking-[0.1em] transition-colors ${
              status === s.value ? "bg-[#17130f] text-white" : "border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f]"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[3px] bg-[#ede9e3]" />)}</div>
      ) : orders.length === 0 ? (
        <div className="rounded-[3px] border border-[#e8e4de] bg-white px-4 py-14 text-center text-sm text-[#9c8f7d]">Замовлень не знайдено</div>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-[#e8e4de] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="px-4 py-3 text-left">№</th>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Покупець</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Доставка</th>
                <th className="px-4 py-3 text-right">Сума</th>
                <th className="px-4 py-3 text-left">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {orders.map((o) => {
                const date = new Date(o.date_created).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
                return (
                  <tr key={o.id} onClick={() => setActive(o)} className="cursor-pointer hover:bg-[#fdfcfb]">
                    <td className="px-4 py-3 font-mono text-[12px] font-medium text-[#17130f]">{o.number}</td>
                    <td className="px-4 py-3 text-[12px] tabular-nums text-[#9c8f7d]">{date}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium">{o.billing.first_name} {o.billing.last_name}</p>
                      {o.billing.phone && <p className="text-[11px] text-[#9c8f7d]">{o.billing.phone}</p>}
                    </td>
                    <td className="hidden px-4 py-3 text-[12px] text-[#9c8f7d] lg:table-cell">
                      {o.shipping_city ? `${o.shipping_city}` : "—"}
                      {o.shipping_branch && <span className="block max-w-[160px] truncate text-[11px] text-[#b9ae9b]">{o.shipping_branch}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{uah(o.total)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusSelect value={o.status} onChange={(s) => changeStatus(o, s)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} замовлень</p>
          <div className="flex items-center gap-2">
            <button onClick={() => load(page - 1)} disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f] disabled:opacity-30">‹</button>
            <span className="min-w-16 text-center text-[12px] text-[#9c8f7d]">{page} / {totalPages}</span>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] hover:text-[#17130f] disabled:opacity-30">›</button>
          </div>
        </div>
      )}

      {active && <OrderDrawer order={active} onClose={() => setActive(null)} onStatus={(s) => changeStatus(active, s)} />}
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
      className="cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-7 text-[11px] uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#17130f]/30"
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s} style={{ background: "#fff", color: "#17130f" }}>{STATUS_META[s]?.label ?? s}</option>
      ))}
    </select>
  );
}

function DrawerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[13px]">
      <span className="w-28 shrink-0 text-[#9c8f7d]">{label}</span>
      <span className="text-[#17130f]">{children}</span>
    </div>
  );
}

function OrderDrawer({ order, onClose, onStatus }: { order: AdminOrder; onClose: () => void; onStatus: (s: string) => void }) {
  const date = new Date(order.date_created).toLocaleString("uk-UA", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const payLabel = order.payment_method === "prepay" ? "Передоплата" : "Накладений платіж";

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eee7db] bg-white px-6 py-4">
          <div>
            <p className="font-mono text-[15px] font-medium text-[#17130f]">{order.number}</p>
            <p className="text-[11px] text-[#9c8f7d]">{date}</p>
          </div>
          <button onClick={onClose} className="text-[#9c8f7d] hover:text-[#17130f]">✕</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Статус</p>
            <StatusSelect value={order.status} onChange={onStatus} />
          </div>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Покупець</p>
            <DrawerRow label="Імʼя">{order.billing.first_name} {order.billing.last_name}</DrawerRow>
            <DrawerRow label="Телефон"><a href={`tel:${order.billing.phone}`} className="underline underline-offset-2">{order.billing.phone || "—"}</a></DrawerRow>
            <DrawerRow label="Email">{order.billing.email || "—"}</DrawerRow>
          </section>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Доставка · Нова Пошта</p>
            <DrawerRow label="Місто">{order.shipping_city || "—"}</DrawerRow>
            <DrawerRow label="Відділення">{order.shipping_branch || "—"}</DrawerRow>
            <DrawerRow label="Оплата">{payLabel}</DrawerRow>
            {order.comment && <DrawerRow label="Коментар">{order.comment}</DrawerRow>}
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Товари ({order.line_items.length})</p>
            <div className="divide-y divide-[#f0ece6] rounded-[3px] border border-[#eee7db]">
              {order.line_items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="h-12 w-9 shrink-0 overflow-hidden bg-[#f3efe8]">
                    {it.image_src && <img src={it.image_src} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[#17130f]">{it.name}</p>
                    <p className="text-[11px] text-[#9c8f7d]">{it.brand} · {uah(it.price)} × {it.quantity}</p>
                  </div>
                  <span className="text-[13px] font-medium tabular-nums">{uah(it.total)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[3px] bg-[#faf8f5] px-4 py-3 text-[13px]">
            <div className="flex justify-between py-0.5 text-[#9c8f7d]"><span>Сума товарів</span><span className="tabular-nums">{uah(order.subtotal)}</span></div>
            <div className="flex justify-between py-0.5 text-[#9c8f7d]"><span>Доставка</span><span className="tabular-nums">{Number(order.shipping_cost) > 0 ? uah(order.shipping_cost) : "за тарифами НП"}</span></div>
            <div className="mt-1 flex justify-between border-t border-[#eee7db] pt-2 text-[15px] font-medium text-[#17130f]"><span>Разом</span><span className="tabular-nums">{uah(order.total)}</span></div>
          </section>
        </div>
      </div>
    </div>
  );
}
