"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/catalog";
import type { Account } from "@/lib/accountsDb";

type Tab = "profile" | "orders" | "wishlist" | "security";

type WcOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  currency_symbol: string;
  line_items: { id: number; name: string; quantity: number; total: string; image?: { src?: string } }[];
};

type WishlistProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  image?: string;
  tone: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  pending:    { label: "Очікує оплати", cls: "bg-amber-50 text-amber-700" },
  processing: { label: "В обробці",     cls: "bg-blue-50 text-blue-700" },
  "on-hold":  { label: "На утриманні",  cls: "bg-orange-50 text-orange-700" },
  completed:  { label: "Виконано",      cls: "bg-green-50 text-green-700" },
  cancelled:  { label: "Скасовано",     cls: "bg-red-50 text-red-600" },
  refunded:   { label: "Повернуто",     cls: "bg-purple-50 text-purple-700" },
};

const TABS: { id: Tab; label: string; href: string; icon: string }[] = [
  { id: "profile",  label: "Профіль",      href: "/account/profile",  icon: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" },
  { id: "orders",   label: "Замовлення",   href: "/account/orders",   icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "wishlist", label: "Список бажань",href: "/account/wishlist", icon: "M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z" },
  { id: "security", label: "Безпека",      href: "/account/profile",  icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d={d} />
    </svg>
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
  const router = useRouter();

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="wrap py-10 md:py-16">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / Мій кабінет
          </p>
          <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">
            {account.first_name ? `Привіт, ${account.first_name}` : "Мій кабінет"}
          </h1>
          <p className="mt-1 text-sm text-muted">{account.email}</p>
        </div>
        <button onClick={logout}
          className="shrink-0 text-[11px] uppercase tracking-luxe text-muted transition-colors hover:text-ink">
          Вийти →
        </button>
      </div>

      {/* Mobile tab strip */}
      <div className="mb-6 -mx-5 flex gap-1 overflow-x-auto border-b border-line px-5 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-4 py-3 text-[11px] uppercase tracking-luxe transition-colors ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar nav (desktop) */}
        <aside className="hidden lg:block">
          <nav className="space-y-0.5 border border-line">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-3 px-5 py-3.5 text-left text-[11px] uppercase tracking-luxe transition-colors ${
                  tab === t.id ? "bg-ink text-paper" : "text-muted hover:text-ink"
                }`}>
                <Icon d={t.icon} />
                {t.label}
              </button>
            ))}
          </nav>

          <div className="mt-4 border border-line p-5">
            <p className="text-[10px] uppercase tracking-luxe text-muted">Клієнт з</p>
            <p className="mt-1 text-sm text-ink">
              {new Date(account.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </aside>

        {/* Content */}
        <main>
          {tab === "profile" && <ProfileTab account={account} onUpdate={setAccount} />}
          {tab === "orders" && <OrdersTab />}
          {tab === "wishlist" && <WishlistTab initialIds={initialWishlist} />}
          {tab === "security" && <SecurityTab />}
        </main>
      </div>
    </div>
  );
}

/* ── Profile ── */
function ProfileTab({ account, onUpdate }: { account: Account; onUpdate: (a: Account) => void }) {
  const [form, setForm] = useState({ first_name: account.first_name, last_name: account.last_name, phone: account.phone, email: account.email });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function set(field: string, val: string) { setForm((f) => ({ ...f, [field]: val })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setError("");
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка"); setStatus("error"); return; }
    setStatus("saved");
    onUpdate({ ...account, ...form });
    setTimeout(() => setStatus("idle"), 2500);
  }

  const inp = "mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none";

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Особисті дані</h2>
      <form onSubmit={save} className="max-w-lg space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-luxe text-muted">Ім'я</span>
            <input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inp} />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-luxe text-muted">Прізвище</span>
            <input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inp} />
          </label>
        </div>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Email</span>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Телефон</span>
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inp} placeholder="+38 (___) ___-__-__" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={status === "saving"}
            className="h-11 bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50">
            {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Збережено" : "Зберегти"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Orders ── */
function OrdersTab() {
  const [orders, setOrders] = useState<WcOrder[]>([]);
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
      <h2 className="mb-6 font-display text-2xl text-ink">Мої замовлення</h2>
      <div className="space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse border border-line bg-cloud/30" />)}
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Мої замовлення</h2>
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
            const st = STATUS[o.status] ?? { label: o.status, cls: "bg-cloud text-muted" };
            const date = new Date(o.date_created).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
            const isOpen = expanded === o.id;
            return (
              <div key={o.id}>
                <button onClick={() => setExpanded(isOpen ? null : o.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-cloud/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-ink">№{o.number}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-luxe ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{date} · {o.line_items.length} позицій</p>
                  </div>
                  <span className="text-sm tabular-nums text-ink">{o.currency_symbol}{o.total}</span>
                  <span className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </button>
                {isOpen && (
                  <div className="border-t border-line bg-cloud/20 px-5 py-4">
                    <ul className="divide-y divide-line/50">
                      {o.line_items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2.5">
                          {item.image?.src && (
                            <div className="relative h-12 w-9 shrink-0 overflow-hidden bg-line">
                              <Image src={item.image.src} alt={item.name} fill sizes="36px" className="object-cover" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{item.name}</p>
                            <p className="text-xs text-muted">×{item.quantity}</p>
                          </div>
                          <span className="text-sm tabular-nums text-ink">{o.currency_symbol}{item.total}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {orders.length === 10 && (
        <div className="mt-4 flex justify-between">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="h-9 border border-line px-5 text-[11px] uppercase tracking-luxe text-ink disabled:opacity-30 hover:border-ink">
            ← Назад
          </button>
          <button onClick={() => setPage(p => p + 1)}
            className="h-9 border border-line px-5 text-[11px] uppercase tracking-luxe text-ink hover:border-ink">
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Wishlist ── */
function WishlistTab({ initialIds }: { initialIds: string[] }) {
  const [ids, setIds] = useState<string[]>(initialIds);
  const [products, setProducts] = useState<WishlistProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setLoading(false); return; }
    fetch(`/api/search?ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((d: { products: WishlistProduct[] }) => { setProducts(d.products ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ids]);

  async function remove(productId: string) {
    await fetch("/api/account/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    });
    setIds((prev) => prev.filter((id) => id !== productId));
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  }

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Список бажань</h2>
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] animate-pulse bg-cloud" />)}
        </div>
      ) : ids.length === 0 ? (
        <div className="border border-line p-10 text-center">
          <p className="font-display text-2xl text-ink/30">Список порожній</p>
          <p className="mt-2 text-sm text-muted">Додавайте товари у серця під час перегляду каталогу</p>
          <Link href="/catalog" className="mt-6 inline-flex h-11 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper hover:opacity-85">
            До каталогу →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="group relative">
              <Link href={`/product/${p.slug}`} className="block">
                <div className="relative aspect-[3/4] overflow-hidden" style={{ backgroundColor: p.tone }}>
                  {p.image && <Image src={p.image} alt={p.name} fill sizes="(min-width:768px) 33vw, 50vw" className="object-cover" />}
                </div>
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-luxe text-muted">{p.brand}</p>
                  <p className="mt-0.5 text-sm text-ink">{p.name}</p>
                  <p className="mt-1 text-sm tabular-nums text-ink">{formatPrice(p.price)}</p>
                </div>
              </Link>
              <button onClick={() => remove(p.id)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-paper/90 text-ink opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-red-50"
                aria-label="Видалити">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Security ── */
function SecurityTab() {
  const [form, setForm] = useState({ current_password: "", new_password: "", new_password2: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function set(field: string, val: string) { setForm((f) => ({ ...f, [field]: val })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.new_password !== form.new_password2) { setError("Паролі не співпадають"); return; }
    if (form.new_password.length < 6) { setError("Пароль мінімум 6 символів"); return; }
    setStatus("saving");
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Помилка"); setStatus("error"); return; }
    setStatus("saved");
    setForm({ current_password: "", new_password: "", new_password2: "" });
    setTimeout(() => setStatus("idle"), 2500);
  }

  const inp = "mt-1.5 h-11 w-full border border-line bg-white px-4 text-sm text-ink focus:border-ink focus:outline-none";

  return (
    <div>
      <h2 className="mb-6 font-display text-2xl text-ink">Безпека</h2>
      <form onSubmit={save} className="max-w-md space-y-5">
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Поточний пароль</span>
          <input type="password" required value={form.current_password} onChange={(e) => set("current_password", e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Новий пароль</span>
          <input type="password" required value={form.new_password} onChange={(e) => set("new_password", e.target.value)} className={inp} placeholder="Мінімум 6 символів" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-luxe text-muted">Повторіть новий пароль</span>
          <input type="password" required value={form.new_password2} onChange={(e) => set("new_password2", e.target.value)} className={inp} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={status === "saving"}
          className="h-11 bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper hover:opacity-85 disabled:opacity-50">
          {status === "saving" ? "Зберігаємо…" : status === "saved" ? "✓ Пароль змінено" : "Змінити пароль"}
        </button>
      </form>
    </div>
  );
}
