"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MEGA_MENU, type MegaMenu } from "@/lib/catalog";
import { CartDrawer } from "./CartDrawer";
import { Grain } from "./Grain";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  user: "M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  bag: "M6 8h12l1 13H5L6 8Zm3 0V6a3 3 0 0 1 6 0v2",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M6 6l12 12M18 6 6 18",
};

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || active !== null || mobileOpen;
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/cart")
      .then((r) => r.json())
      .then((c: { items_count: number }) => setCartCount(c.items_count));
    const onUpdate = (e: Event) => {
      setCartCount((e as CustomEvent<{ count: number }>).detail.count);
    };
    window.addEventListener("cart:updated", onUpdate);
    return () => window.removeEventListener("cart:updated", onUpdate);
  }, []);

  return (
    <>
      {/* announcement bar — scrolls away */}
      <div className="bg-ink text-paper">
        <p className="wrap py-2 text-center text-[11px] uppercase tracking-luxe">
          Безкоштовна доставка Новою Поштою від 3 000 ₴ · Оригінал гарантовано
        </p>
      </div>

      <header
        onMouseLeave={() => setActive(null)}
        className={`sticky top-0 z-50 transition-colors duration-300 ${
          solid
            ? "border-b border-line bg-paper/95 text-ink backdrop-blur-md"
            : "border-b border-transparent text-paper"
        }`}
      >
        <div className="wrap grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          {/* left — nav */}
          <nav className="hidden items-center gap-7 md:flex">
            {MEGA_MENU.map((item) => (
              <button
                key={item.label}
                onMouseEnter={() => setActive(item.label)}
                onFocus={() => setActive(item.label)}
                className={`link-underline text-[11px] uppercase tracking-luxe transition-opacity ${
                  active === item.label ? "opacity-100" : "opacity-75 hover:opacity-100"
                }`}
              >
                {item.label}
              </button>
            ))}
            <a
              href="#delivery"
              onMouseEnter={() => setActive(null)}
              className="link-underline text-[11px] uppercase tracking-luxe opacity-75 hover:opacity-100"
            >
              Доставка
            </a>
          </nav>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="-ml-1 flex h-9 w-9 items-center justify-center md:hidden"
            aria-label="Меню"
            aria-expanded={mobileOpen}
          >
            <Icon d={mobileOpen ? ICONS.close : ICONS.menu} />
          </button>

          {/* center — wordmark */}
          <Link
            href="/"
            onMouseEnter={() => setActive(null)}
            className="justify-self-center font-display text-xl tracking-wordmark md:text-2xl"
          >
            MANIA&nbsp;GROUP
          </Link>

          {/* right — utilities */}
          <div
            className="flex items-center justify-end gap-4 md:gap-5"
            onMouseEnter={() => setActive(null)}
          >
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Пошук"
              className="hidden hover:opacity-60 sm:block"
            >
              <Icon d={ICONS.search} />
            </button>
            <button aria-label="Акаунт" className="hidden hover:opacity-60 sm:block">
              <Icon d={ICONS.user} />
            </button>
            <button
              onClick={() => setCartOpen(true)}
              aria-label="Кошик"
              className="relative hover:opacity-60"
            >
              <Icon d={ICONS.bag} />
              <span
                className={`absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-medium ${
                  solid ? "bg-ink text-paper" : "bg-paper text-ink"
                }`}
              >
                {cartCount > 0 ? cartCount : ""}
              </span>
            </button>
          </div>
        </div>

        {/* mega-menu panel */}
        {active && (
          <MegaPanel item={MEGA_MENU.find((m) => m.label === active)!} />
        )}
      </header>

      {/* mobile menu */}
      {mobileOpen && (
        <nav className="border-b border-line bg-paper text-ink md:hidden">
          <ul className="wrap flex flex-col py-2">
            {MEGA_MENU.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block py-3 text-[12px] uppercase tracking-luxe opacity-80"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#delivery"
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-[12px] uppercase tracking-luxe opacity-80"
              >
                Доставка
              </a>
            </li>
          </ul>
        </nav>
      )}

      {/* search overlay */}
      <div
        className={`fixed inset-0 z-[70] ${searchOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!searchOpen}
      >
        <div
          onClick={() => setSearchOpen(false)}
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${
            searchOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-x-0 top-0 bg-paper transition-transform duration-400 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
            searchOpen ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!query.trim()) return;
              setSearchOpen(false);
              router.push(`/catalog?q=${encodeURIComponent(query.trim())}`);
            }}
            className="wrap flex items-center gap-4 py-8"
          >
            <Icon d={ICONS.search} />
            <input
              autoFocus={searchOpen}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Шукати товари…"
              className="flex-1 border-b border-line bg-transparent py-2 font-display text-2xl text-ink placeholder:text-muted focus:border-ink focus:outline-none md:text-3xl"
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Закрити"
              className="text-ink hover:opacity-60"
            >
              <Icon d={ICONS.close} />
            </button>
          </form>
        </div>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-line bg-paper/95 backdrop-blur-md md:hidden">
        <Link href="/catalog" className="flex flex-col items-center gap-1 py-2.5 text-ink">
          <Icon d={ICONS.menu} />
          <span className="text-[9px] uppercase tracking-luxe">Каталог</span>
        </Link>
        <button
          onClick={() => setSearchOpen(true)}
          className="flex flex-col items-center gap-1 py-2.5 text-ink"
        >
          <Icon d={ICONS.search} />
          <span className="text-[9px] uppercase tracking-luxe">Пошук</span>
        </button>
        <button
          onClick={() => setCartOpen(true)}
          className="relative flex flex-col items-center gap-1 py-2.5 text-ink"
        >
          <Icon d={ICONS.bag} />
          <span className="text-[9px] uppercase tracking-luxe">Кошик</span>
          {cartCount > 0 && (
            <span className="absolute right-6 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[9px] font-medium text-paper">
              {cartCount}
            </span>
          )}
        </button>
        <button className="flex flex-col items-center gap-1 py-2.5 text-ink">
          <Icon d={ICONS.user} />
          <span className="text-[9px] uppercase tracking-luxe">Профіль</span>
        </button>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

function MegaPanel({ item }: { item: MegaMenu }) {
  return (
    <div className="absolute inset-x-0 top-full hidden border-b border-line bg-paper text-ink shadow-[0_28px_44px_-28px_rgba(23,19,15,0.35)] md:block">
      <div className="wrap grid grid-cols-4 gap-8 py-10">
        {item.columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-[11px] uppercase tracking-luxe text-muted">
              {col.title}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.slug}>
                  <Link
                    href={`/catalog?category=${l.slug}`}
                    className="text-sm text-ink/80 transition-colors hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <Link
          href={`/catalog?category=${item.featured.slug}`}
          className="group relative col-start-3 col-end-5 aspect-[16/9] overflow-hidden"
        >
          <div
            className="absolute inset-0 transition-transform duration-[1200ms] ease-out group-hover:scale-105"
            style={{
              backgroundColor: item.featured.tone,
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0) 35%, rgba(23,19,15,0.45) 100%)",
            }}
          />
          <Grain />
          <div className="absolute inset-0 flex flex-col justify-end p-6 text-paper">
            <p className="font-display text-2xl">{item.featured.title}</p>
            <span className="mt-1 text-[11px] uppercase tracking-luxe">
              {item.featured.caption} →
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
