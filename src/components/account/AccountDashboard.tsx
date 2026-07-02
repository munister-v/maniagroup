"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWishlist } from "@/components/WishlistContext";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/catalog";
import type { Account } from "@/lib/accountsDb";

type Tab = "profile" | "orders" | "wishlist" | "security";

type DbOrder = {
  id: number; number: string; status: string; date_created: string;
  total: string; currency_symbol: string;
  ttn?: string | null; tracking_url?: string | null;
  shipping_city?: string | null; shipping_branch?: string | null;
  payment_method?: string | null;
  line_items: { id: number; name: string; quantity: number; total: string; image?: { src?: string } }[];
};

type WishlistProduct = { id: string; slug: string; name: string; brand: string; price: number; image?: string; tone: string };

const STATUS: Record<string, { label: string; dot: string; badge: string }> = {
  pending:    { label: "Очікує оплати", dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  processing: { label: "В обробці",     dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
  "on-hold":  { label: "На утриманні",  dot: "bg-orange-400", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  completed:  { label: "Виконано",      dot: "bg-green-500",  badge: "bg-green-50 text-green-700 border-green-200" },
  cancelled:  { label: "Скасовано",     dot: "bg-red-400",    badge: "bg-red-50 text-red-600 border-red-200" },
  refunded:   { label: "Повернуто",     dot: "bg-purple-400", badge: "bg-purple-50 text-purple-700 border-purple-200" },
};

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "profile",  label: "Профіль",       icon: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" },
  { id: "orders",   label: "Замовлення",    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "wishlist", label: "Обране",        icon: "M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z" },
  { id: "security", label: "Безпека",       icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" },
];

function SvgIcon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

function Avatar({ name, email, size = "lg" }: { name: string; email: string; size?: "sm" | "lg" }) {
  const initials = name.trim()
    ? name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : email[0].toUpperCase();
  const sz = size === "lg" ? "h-16 w-16 text-xl" : "h-9 w-9 text-sm";
  return (
    <div className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-ink font-display font-semibold text-paper`}>
      {initials}
    </div>
  );
}

export function AccountDashboard({
  initialAccount,
  initialTab,
  initialWishlist = [],
}: {
  initialAccount: Account;
  initialTab: Tab;
  initialWishlist?: string[];
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [account, setAccount] = useState(initialAccount);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const { ids: wishIds } = useWishlist();
  const router = useRouter();

  const fullName = [account.first_name, account.last_name].filter(Boolean).join(" ") || "Клієнт";

  useEffect(() => {
    fetch("/api/account/orders?page=1")
      .then((r) => r.json())
      .then((d: DbOrder[]) => { if (Array.isArray(d)) setOrderCount(d.length >= 10 ? 10 : d.length); })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const memberSince = new Date(account.created_at).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

  return (
    <div className="wrap py-8 md:py-14">
      {/* ── Hero header ── */}
      <div className="mb-8 flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={fullName} email={account.email} size="lg" />
          <div>
            <h1 className="font-display text-2xl text-ink md:text-3xl">{fullName}</h1>
            <p className="mt-0.5 text-sm text-muted">{account.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-luxe text-muted">Клієнт з {memberSince}</p>
          </div>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <div className="flex items-center gap-4">
            <button onClick={() => setTab("orders")}
              className="flex flex-col items-center rounded border border-line px-4 py-2 text-center transition-colors hover:border-ink">
              <span className="font-display text-xl text-ink">{orderCount ?? "—"}</span>
              <span className="text-[10px] uppercase tracking-luxe text-muted">замовлень</span>
            </button>
            <button onClick={() => setTab("wishlist")}
              className="flex flex-col items-center rounded border border-line px-4 py-2 text-center transition-colors hover:border-ink">
              <span className="font-display text-xl text-ink">{wishIds.size}</span>
              <span className="text-[10px] uppercase tracking-luxe text-muted">в обраному</span>
            </button>
          </div>
          <button onClick={logout}
            className="text-[11px] uppercase tracking-luxe text-muted transition-colors hover:text-ink">
            Вийти →
          </button>
        </div>
      </div>

      {/* ── Mobile tabs ── */}
      <div className="mb-6 -mx-5 flex overflow-x-auto border-b border-line px-5 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-[11px] uppercase tracking-luxe transition-colors ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted"
            }`}>
            <SvgIcon d={t.icon} className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden lg:block">
          <nav className="divide-y divide-line border border-line">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[11px] uppercase tracking-luxe transition-colors ${
                  tab === t.id ? "bg-ink text-paper" : "text-muted hover:bg-cloud/40 hover:text-ink"
                }`}>
                <SvgIcon d={t.icon} />
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Content ── */}
        <main className="min-w-0">
          {tab === "profile"  && <ProfileTab account={account} onUpdate={setAccount} />}
          {tab === "orders"   && <OrdersTab />}
          {tab === "wishlist" && <WishlistTab initialIds={initialWishlist} />}
          {tab === "security" && <SecurityTab />}
        </main>
      </div>
    </div>
  );
}

/* ════════════════════════════════ PROFILE ════════════════════════════════ */
function ProfileTab({ account, onUpdate }: { account: Account; onUpdate: (a: Account) => void }) {
  const [form, setForm] = useState({
    first_name: account.first_name, last_name: account.last_name,
    phone: account.phone, email: account.email,
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const f = (field: string, val: string) => setForm((p) => ({ ...p, [field]: val }));
  const inp = "mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none transition-colors";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setError("");
    const res = await fetch("/api/account/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка"); setStatus("error"); return; }
    setStatus("saved");
    onUpdate({ ...account, ...form });
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">Особисті дані</h2>
      </div>
      <form onSubmit={save} className="max-w-lg space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-luxe text-muted">Ім'я</span>
            <input value={form.first_name} onChange={(e) => f("first_name", e.target.value)} className={inp} autoComplete="given-name" />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-luxe text-muted">Прізвище</span>
            <input value={form.last_name} onChange={(e) => f("last_name", e.target.value)} className={inp} autoComplete="family-name" />
          </label>
        </div>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Email</span>
          <input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} className={inp} autoComplete="email" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Телефон</span>
          <input type="tel" value={form.phone} onChange={(e) => f("phone", e.target.value)} className={inp} placeholder="+38 (___) ___-__-__" autoComplete="tel" />
        </label>

        {error && (
          <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-4 pt-1">
          <button type="submit" disabled={status === "saving"}
            className="h-11 bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
            {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Збережено" : "Зберегти"}
          </button>
          {status === "saved" && <p className="text-sm text-green-700">Дані оновлено</p>}
        </div>
      </form>

      {/* Delivery hint */}
      <div className="mt-10 border border-line/50 bg-cloud/30 p-5">
        <p className="text-[11px] uppercase tracking-luxe text-muted">Доставка</p>
        <p className="mt-1 text-sm text-ink/70">
          Адреса доставки зберігається при оформленні кожного замовлення. Перегляньте останні замовлення, щоб відстежити доставку або знайти номер ТТН.
        </p>
        <button onClick={() => document.querySelector<HTMLButtonElement>("[data-tab=orders]")?.click()}
          className="mt-3 text-[11px] uppercase tracking-luxe text-ink underline underline-offset-2 hover:opacity-60">
          Мої замовлення →
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════ ORDERS ════════════════════════════════ */
function OrdersTab() {
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/account/orders?page=${page}`)
      .then((r) => r.json())
      .then((d) => { setOrders(Array.isArray(d) ? d : []); setLoading(false); });
  }, [page]);

  if (loading) return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Замовлення</h2>
      <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse border border-line bg-cloud/30" />)}</div>
    </div>
  );

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Замовлення</h2>
      {orders.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="font-display text-2xl text-ink/30">Замовлень ще немає</p>
          <p className="mt-2 text-sm text-muted">Перейдіть до каталогу та оберіть перші речі</p>
          <Link href="/catalog" className="mt-6 inline-flex h-11 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper hover:opacity-85">
            До каталогу →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-line border border-line">
          {orders.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, dot: "bg-muted", badge: "bg-cloud text-muted border-line" };
            const date = new Date(o.date_created).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
            const isOpen = expanded === o.id;
            const hasTracking = Boolean(o.ttn);
            return (
              <div key={o.id}>
                <button data-tab="orders" onClick={() => setExpanded(isOpen ? null : o.id)}
                  className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-cloud/20">
                  {/* Status dot */}
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">№{o.number}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-luxe ${st.badge}`}>{st.label}</span>
                      {hasTracking && (
                        <a href={o.tracking_url ?? "#"} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] uppercase tracking-luxe text-blue-700 hover:bg-blue-100">
                          <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          ТТН {o.ttn}
                        </a>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {date}
                      {o.shipping_city && ` · ${o.shipping_city}`}
                      {o.shipping_branch && `, відд. ${o.shipping_branch}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums font-medium text-ink">{o.currency_symbol}{o.total}</span>
                    <span className={`text-muted transition-transform text-xs ${isOpen ? "rotate-180" : ""}`}>▾</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-line/50 bg-cloud/20 px-5 py-4">
                    <ul className="divide-y divide-line/40">
                      {o.line_items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2.5">
                          {item.image?.src && (
                            <div className="relative h-14 w-10 shrink-0 overflow-hidden bg-line">
                              <Image src={item.image.src} alt={item.name} fill sizes="40px" className="object-cover" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{item.name}</p>
                            <p className="text-xs text-muted">× {item.quantity}</p>
                          </div>
                          <span className="shrink-0 text-sm tabular-nums text-ink">{o.currency_symbol}{item.total}</span>
                        </li>
                      ))}
                    </ul>
                    {hasTracking && (
                      <a href={o.tracking_url ?? "#"} target="_blank" rel="noopener noreferrer"
                        className="mt-3 inline-flex h-9 items-center gap-2 border border-blue-300 bg-blue-50 px-4 text-[11px] uppercase tracking-luxe text-blue-700 hover:bg-blue-100">
                        Відстежити на Nova Poshta →
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {orders.length === 10 && (
        <div className="mt-4 flex gap-3">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="h-9 border border-line px-5 text-[11px] uppercase tracking-luxe text-ink disabled:opacity-30 hover:border-ink transition-colors">
            ← Назад
          </button>
          <button onClick={() => setPage(p => p + 1)}
            className="h-9 border border-line px-5 text-[11px] uppercase tracking-luxe text-ink hover:border-ink transition-colors">
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════ WISHLIST ════════════════════════════════ */
function WishlistTab({ initialIds }: { initialIds: string[] }) {
  const { ids: ctxIds, toggle } = useWishlist();
  const [localIds, setLocalIds] = useState<string[]>(initialIds);
  const ids = localIds.length >= initialIds.length ? localIds : initialIds;
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const merged = [...new Set([...ids, ...[...ctxIds]])];
    if (merged.length === 0) { setLoading(false); return; }
    fetch(`/api/search?ids=${merged.join(",")}`)
      .then((r) => r.json())
      .then((d: { products: WishlistProduct[] }) => {
        const active = new Set([...ctxIds, ...ids]);
        setProducts((d.products ?? []).filter((p) => active.has(p.id)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxIds]);

  async function remove(productId: string) {
    await toggle(productId);
    setLocalIds((prev) => prev.filter((id) => id !== productId));
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  }

  const isEmpty = !loading && [...ctxIds].length === 0 && ids.length === 0;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="font-display text-2xl text-ink">Обране</h2>
        {products.length > 0 && <span className="text-sm text-muted">· {products.length} товарів</span>}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] animate-pulse bg-cloud" />)}
        </div>
      ) : isEmpty ? (
        <div className="border border-line p-10 text-center">
          <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10 text-ink/15" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="mt-3 font-display text-xl text-ink/30">Список порожній</p>
          <p className="mt-1 text-sm text-muted">Натисніть ♡ на будь-якому товарі, щоб додати</p>
          <Link href="/catalog" className="mt-5 inline-flex h-11 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper hover:opacity-85">
            До каталогу →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="group relative">
              <Link href={`/product/${p.slug}`} className="block">
                <div className="relative aspect-[3/4] overflow-hidden" style={{ backgroundColor: p.tone }}>
                  {p.image && <Image src={p.image} alt={p.name} fill sizes="(min-width:768px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
                </div>
                <div className="mt-2.5">
                  <p className="text-[10px] uppercase tracking-luxe text-muted">{p.brand}</p>
                  <p className="mt-0.5 text-sm leading-snug text-ink">{p.name}</p>
                  <p className="mt-1 text-sm tabular-nums text-ink">{formatPrice(p.price)}</p>
                </div>
              </Link>
              {/* Remove button */}
              <button onClick={() => remove(p.id)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-paper/90 text-ink opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-red-600"
                aria-label="Видалити з обраного">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" stroke="currentColor" strokeWidth="0">
                  <path d="M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════ SECURITY ════════════════════════════════ */
function SecurityTab() {
  const [form, setForm] = useState({ current_password: "", new_password: "", new_password2: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const f = (field: string, val: string) => setForm((p) => ({ ...p, [field]: val }));
  const inp = "mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none transition-colors";

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (form.new_password !== form.new_password2) { setError("Паролі не співпадають"); return; }
    if (form.new_password.length < 6) { setError("Пароль мінімум 6 символів"); return; }
    setStatus("saving");
    const res = await fetch("/api/account/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка"); setStatus("error"); return; }
    setStatus("saved");
    setForm({ current_password: "", new_password: "", new_password2: "" });
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div>
      <h2 className="mb-2 font-display text-2xl text-ink">Безпека</h2>
      <p className="mb-6 text-sm text-muted">Змініть пароль для входу в акаунт</p>
      <form onSubmit={save} className="max-w-md space-y-5">
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Поточний пароль</span>
          <input type="password" required value={form.current_password} onChange={(e) => f("current_password", e.target.value)} className={inp} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Новий пароль</span>
          <input type="password" required value={form.new_password} onChange={(e) => f("new_password", e.target.value)} className={inp} placeholder="Мінімум 6 символів" autoComplete="new-password" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Повторіть новий пароль</span>
          <input type="password" required value={form.new_password2} onChange={(e) => f("new_password2", e.target.value)} className={inp} autoComplete="new-password" />
        </label>
        {error && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <button type="submit" disabled={status === "saving"}
          className="h-11 bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
          {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Пароль змінено" : "Змінити пароль"}
        </button>
      </form>

      <div className="mt-10 border border-amber-200/60 bg-amber-50/40 p-4 text-[12px] text-amber-800">
        💡 Якщо ви забули пароль — вийдіть і скористайтесь «Забули пароль?» на сторінці входу.
      </div>
    </div>
  );
}
