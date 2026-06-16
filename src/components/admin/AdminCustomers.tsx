"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS_META, type AdminOrder } from "./AdminOrders";

type Customer = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  created_at: string;
  orders_count: number;
  total_spent: number;
  wishlist_count: number;
};

const PER_PAGE = 30;
const uah = (v: number | string) => Number(v).toLocaleString("uk-UA") + " ₴";

export function AdminCustomers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Customer | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, qv: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (qv.trim()) params.set("q", qv.trim());
      const res = await fetch(`/api/admin/customers?${params}`);
      const data = await res.json();
      setRows(data.customers ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1, v), 350);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#9c8f7d]">{total.toLocaleString("uk-UA")} клієнтів</p>
        <div className="relative">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Імʼя, email, телефон…"
            className="h-9 w-72 rounded-[3px] border border-[#e8e4de] bg-white pl-9 pr-3 text-[13px] focus:border-[#17130f] focus:outline-none" />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#b9ae9b]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[3px] bg-[#ede9e3]" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[3px] border border-[#e8e4de] bg-white px-4 py-14 text-center text-sm text-[#9c8f7d]">Клієнтів не знайдено</div>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-[#e8e4de] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#f0ece6] text-[10px] uppercase tracking-wider text-[#9c8f7d]">
                <th className="px-4 py-3 text-left">Клієнт</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Контакти</th>
                <th className="px-4 py-3 text-center">Замовлень</th>
                <th className="px-4 py-3 text-right">Витрачено</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">З нами з</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f4f0]">
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setActive(c)} className="cursor-pointer hover:bg-[#fdfcfb]">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[#17130f]">{c.first_name} {c.last_name || ""}</p>
                    <p className="text-[11px] text-[#9c8f7d] md:hidden">{c.email}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-[12px] text-[#9c8f7d] md:table-cell">
                    <p>{c.email}</p>
                    {c.phone && <p className="text-[11px] text-[#b9ae9b]">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-[13px] tabular-nums">{c.orders_count}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-medium tabular-nums">{uah(c.total_spent)}</td>
                  <td className="hidden px-4 py-3 text-[12px] tabular-nums text-[#9c8f7d] sm:table-cell">
                    {new Date(c.created_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > PER_PAGE && (
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => load(page - 1, search)} disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] disabled:opacity-30">‹</button>
          <span className="min-w-16 text-center text-[12px] text-[#9c8f7d]">{page} / {totalPages}</span>
          <button onClick={() => load(page + 1, search)} disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e8e4de] bg-white text-[#9c8f7d] hover:border-[#17130f] disabled:opacity-30">›</button>
        </div>
      )}

      {active && <CustomerDrawer customer={active} onClose={() => setActive(null)} />}
    </div>
  );
}

type CustomerNote = { id: number; body: string; author: string; created_at: string };

const SEGMENT_META: Record<string, { label: string; bg: string; color: string }> = {
  vip:     { label: "VIP",           bg: "#f3e5f5", color: "#6a1b9a" },
  regular: { label: "Постійний",     bg: "#e8f5e9", color: "#2e7d32" },
  dormant: { label: "Сплячий",       bg: "#fff3e0", color: "#bf360c" },
  new:     { label: "Новий",         bg: "#e3f2fd", color: "#1565c0" },
  lead:    { label: "Без замовлень",  bg: "#f5f1ea", color: "#9c8f7d" },
};

function CustomerDrawer({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [segment, setSegment] = useState<string>("");
  const [avgOrder, setAvgOrder] = useState(0);
  const [lastOrder, setLastOrder] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/customers/${customer.id}`).then((r) => r.json()).then((d) => {
      setOrders(d.orders ?? []);
      setTags(d.tags ?? []);
      setNotes(d.notes ?? []);
      setSegment(d.segment ?? "");
      setAvgOrder(d.avg_order ?? 0);
      setLastOrder(d.customer?.last_order ?? null);
    });
  }, [customer.id]);

  async function saveTags(next: string[]) {
    setTags(next);
    await fetch(`/api/admin/customers/${customer.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    });
  }
  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) saveTags([...tags, t]);
    setTagInput("");
  }
  async function addNote() {
    const text = note.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) { setNote(""); setNotes((await res.json()).notes ?? []); }
    } finally { setSavingNote(false); }
  }

  const seg = segment ? SEGMENT_META[segment] : null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eee7db] bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium text-[#17130f]">{customer.first_name} {customer.last_name}</p>
              {seg && <span className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: seg.bg, color: seg.color }}>{seg.label}</span>}
            </div>
            <p className="text-[11px] text-[#9c8f7d]">{customer.email}</p>
          </div>
          <button onClick={onClose} className="text-[#9c8f7d] hover:text-[#17130f]">✕</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Замовлень" value={String(customer.orders_count)} />
            <Stat label="Витрачено" value={uah(customer.total_spent)} />
            <Stat label="Сер. чек" value={avgOrder ? uah(avgOrder) : "—"} />
            <Stat label="Обране" value={String(customer.wishlist_count)} />
          </div>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Теги</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#f0ece6] px-2.5 py-1 text-[11px] text-[#17130f]">
                  {t}
                  <button onClick={() => saveTags(tags.filter((x) => x !== t))} className="text-[#9c8f7d] hover:text-[#c62828]">✕</button>
                </span>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
                placeholder="+ тег"
                className="h-7 w-24 rounded-full border border-[#e8e4de] bg-white px-3 text-[11px] focus:border-[#17130f] focus:outline-none" />
            </div>
          </section>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Контакти</p>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#9c8f7d]">Телефон</span><a href={`tel:${customer.phone}`} className="text-[#17130f] underline underline-offset-2">{customer.phone || "—"}</a></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#9c8f7d]">Email</span><span className="text-[#17130f]">{customer.email}</span></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#9c8f7d]">Реєстрація</span><span className="text-[#17130f]">{new Date(customer.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}</span></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#9c8f7d]">Останнє замов.</span><span className="text-[#17130f]">{lastOrder ? new Date(lastOrder).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span></div>
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Замовлення</p>
            {orders === null ? (
              <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-[#ede9e3]" />)}</div>
            ) : orders.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[#9c8f7d]">Замовлень ще немає</p>
            ) : (
              <div className="divide-y divide-[#f0ece6] rounded-[3px] border border-[#eee7db]">
                {orders.map((o) => {
                  const st = STATUS_META[o.status] ?? { label: o.status, bg: "#f5f5f5", color: "#555" };
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="font-mono text-[12px] text-[#9c8f7d]">{o.number}</span>
                      <span className="flex-1 text-[11px] text-[#b9ae9b]">{new Date(o.date_created).toLocaleDateString("uk-UA")}</span>
                      <span className="text-[12px] font-medium tabular-nums text-[#17130f]">{uah(o.total)}</span>
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9c8f7d]">Нотатки про клієнта</p>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Додати нотатку…"
                className="h-9 flex-1 rounded-[3px] border border-[#e8e4de] bg-white px-3 text-[13px] focus:border-[#17130f] focus:outline-none" />
              <button onClick={addNote} disabled={savingNote || !note.trim()}
                className="h-9 rounded-[3px] border border-[#17130f] px-4 text-[11px] uppercase tracking-wider text-[#17130f] hover:bg-[#17130f] hover:text-white disabled:opacity-40">
                {savingNote ? "…" : "Додати"}
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {notes.length === 0 && <li className="text-[12px] text-[#b9ae9b]">Нотаток ще немає</li>}
              {notes.map((n) => (
                <li key={n.id} className="rounded-[3px] border border-[#f0ece6] bg-[#faf8f5] px-3 py-2">
                  <p className="text-[13px] leading-snug text-[#17130f]">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-[#9c8f7d]">{new Date(n.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-[#eee7db] bg-[#faf8f5] px-3 py-3 text-center">
      <p className="text-[16px] font-medium tabular-nums text-[#17130f]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#9c8f7d]">{label}</p>
    </div>
  );
}
