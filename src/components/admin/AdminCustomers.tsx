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

type SortKey = "name" | "email" | "orders_count" | "total_spent" | "wishlist_count" | "created_at";

export function AdminCustomers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [active, setActive] = useState<Customer | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, qv: string, seg: string, sb: SortKey, sd: "asc" | "desc") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), sortBy: sb, sortDir: sd });
      if (qv.trim()) params.set("q", qv.trim());
      if (seg) params.set("segment", seg);
      const res = await fetch(`/api/admin/customers?${params}`);
      const data = await res.json();
      setRows(data.customers ?? []);
      setTotal(data.total ?? 0);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, "", "", "created_at", "desc"); }, [load]);

  function onSearch(v: string) {
    setSearch(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1, v, segment, sortBy, sortDir), 350);
  }

  function onSegment(v: string) {
    setSegment(v);
    load(1, search, v, sortBy, sortDir);
  }

  function toggleSort(key: SortKey) {
    const dir = sortBy === key && sortDir === "desc" ? "asc" : sortBy === key ? "desc" : "desc";
    setSortBy(key);
    setSortDir(dir);
    load(page, search, segment, key, dir);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const sortTh = (key: SortKey, label: string, align: "left" | "center" | "right" = "left", extraCls = "") => (
    <th className={`px-4 py-3 text-${align} ${extraCls}`}>
      <button onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1 hover:text-[#2b2d42] ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {sortBy === key && <span className="text-[#2f9488]">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[#8a94a0]">{total.toLocaleString("uk-UA")} клієнтів</p>
        <div className="flex items-center gap-2">
          <select value={segment} onChange={(e) => onSegment(e.target.value)}
            className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2.5 text-[13px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none">
            <option value="">Усі сегменти</option>
            <option value="vip">VIP</option>
            <option value="regular">Постійний</option>
            <option value="dormant">Сплячий</option>
            <option value="new">Новий</option>
            <option value="lead">Без замовлень</option>
          </select>
          <div className="relative">
            <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Імʼя, email, телефон…"
              className="h-9 w-72 rounded-[3px] border border-[#e6eaec] bg-white pl-9 pr-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#aab4bf]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[3px] bg-[#eef2f3]" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-[3px] border border-[#e6eaec] bg-white px-4 py-14 text-center text-sm text-[#8a94a0]">Клієнтів не знайдено</div>
      ) : (
        <div className="overflow-x-auto rounded-[3px] border border-[#e6eaec] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[#eef2f3] text-[10px] uppercase tracking-wider text-[#8a94a0]">
                {sortTh("name", "Клієнт")}
                {sortTh("email", "Контакти", "left", "hidden md:table-cell")}
                {sortTh("orders_count", "Замовлень", "center")}
                {sortTh("total_spent", "Витрачено", "right")}
                {sortTh("created_at", "З нами з", "left", "hidden sm:table-cell")}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f9fa]">
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setActive(c)} className="cursor-pointer hover:bg-[#fafbfc]">
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[#2b2d42]">{c.first_name} {c.last_name || ""}</p>
                    <p className="text-[11px] text-[#8a94a0] md:hidden">{c.email}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-[12px] text-[#8a94a0] md:table-cell">
                    <p>{c.email}</p>
                    {c.phone && <p className="text-[11px] text-[#aab4bf]">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-center text-[13px] tabular-nums">{c.orders_count}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-medium tabular-nums">{uah(c.total_spent)}</td>
                  <td className="hidden px-4 py-3 text-[12px] tabular-nums text-[#8a94a0] sm:table-cell">
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
          <button onClick={() => load(page - 1, search, segment, sortBy, sortDir)} disabled={page <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] disabled:opacity-30">‹</button>
          <span className="min-w-16 text-center text-[12px] text-[#8a94a0]">{page} / {totalPages}</span>
          <button onClick={() => load(page + 1, search, segment, sortBy, sortDir)} disabled={page >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-[#e6eaec] bg-white text-[#8a94a0] hover:border-[#2b2d42] disabled:opacity-30">›</button>
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
  lead:    { label: "Без замовлень",  bg: "#f7f9fa", color: "#8a94a0" },
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eef2f3] bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium text-[#2b2d42]">{customer.first_name} {customer.last_name}</p>
              {seg && <span className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider" style={{ background: seg.bg, color: seg.color }}>{seg.label}</span>}
            </div>
            <p className="text-[11px] text-[#8a94a0]">{customer.email}</p>
          </div>
          <button onClick={onClose} className="text-[#8a94a0] hover:text-[#2b2d42]">✕</button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Замовлень" value={String(customer.orders_count)} />
            <Stat label="Витрачено" value={uah(customer.total_spent)} />
            <Stat label="Сер. чек" value={avgOrder ? uah(avgOrder) : "—"} />
            <Stat label="Обране" value={String(customer.wishlist_count)} />
          </div>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Теги</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#eef2f3] px-2.5 py-1 text-[11px] text-[#2b2d42]">
                  {t}
                  <button onClick={() => saveTags(tags.filter((x) => x !== t))} className="text-[#8a94a0] hover:text-[#c62828]">✕</button>
                </span>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
                placeholder="+ тег"
                className="h-7 w-24 rounded-full border border-[#e6eaec] bg-white px-3 text-[11px] focus:border-[#2b2d42] focus:outline-none" />
            </div>
          </section>

          <section>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#8a94a0]">Контакти</p>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#8a94a0]">Телефон</span><a href={`tel:${customer.phone}`} className="text-[#2b2d42] underline underline-offset-2">{customer.phone || "—"}</a></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#8a94a0]">Email</span><span className="text-[#2b2d42]">{customer.email}</span></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#8a94a0]">Реєстрація</span><span className="text-[#2b2d42]">{new Date(customer.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}</span></div>
            <div className="flex gap-3 py-1.5 text-[13px]"><span className="w-24 shrink-0 text-[#8a94a0]">Останнє замов.</span><span className="text-[#2b2d42]">{lastOrder ? new Date(lastOrder).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span></div>
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Замовлення</p>
            {orders === null ? (
              <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-[#eef2f3]" />)}</div>
            ) : orders.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[#8a94a0]">Замовлень ще немає</p>
            ) : (
              <div className="divide-y divide-[#eef2f3] rounded-[3px] border border-[#eef2f3]">
                {orders.map((o) => {
                  const st = STATUS_META[o.status] ?? { label: o.status, bg: "#f5f5f5", color: "#555" };
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="font-mono text-[12px] text-[#8a94a0]">{o.number}</span>
                      <span className="flex-1 text-[11px] text-[#aab4bf]">{new Date(o.date_created).toLocaleDateString("uk-UA")}</span>
                      <span className="text-[12px] font-medium tabular-nums text-[#2b2d42]">{uah(o.total)}</span>
                      <span className="inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#8a94a0]">Нотатки про клієнта</p>
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNote(); }}
                placeholder="Додати нотатку…"
                className="h-9 flex-1 rounded-[3px] border border-[#e6eaec] bg-white px-3 text-[13px] focus:border-[#2b2d42] focus:outline-none" />
              <button onClick={addNote} disabled={savingNote || !note.trim()}
                className="h-9 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-wider text-[#2f9488] hover:bg-[#2f9488] hover:text-white disabled:opacity-40">
                {savingNote ? "…" : "Додати"}
              </button>
            </div>
            <ul className="mt-3 space-y-2">
              {notes.length === 0 && <li className="text-[12px] text-[#aab4bf]">Нотаток ще немає</li>}
              {notes.map((n) => (
                <li key={n.id} className="rounded-[3px] border border-[#eef2f3] bg-[#f7f9fa] px-3 py-2">
                  <p className="text-[13px] leading-snug text-[#2b2d42]">{n.body}</p>
                  <p className="mt-0.5 text-[10px] text-[#8a94a0]">{new Date(n.created_at).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
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
    <div className="rounded-[3px] border border-[#eef2f3] bg-[#f7f9fa] px-3 py-3 text-center">
      <p className="text-[16px] font-medium tabular-nums text-[#2b2d42]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#8a94a0]">{label}</p>
    </div>
  );
}
