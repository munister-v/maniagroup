"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { MEGA_MENU, type MegaMenu } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";
import { BrandLogo } from "./BrandLogo";

type Brand = { name: string; slug: string };

type BrandWithLogo = Brand & { logo: string | null };

/** Resolve logos, deduplicate families sharing the same logo, sort logo-first. */
function orderBrands(brands: Brand[], logoMap: Record<string, string>): BrandWithLogo[] {
  // Group by logo URL: when several brands share a URL, keep the shortest name (root brand)
  const byLogoUrl = new Map<string, BrandWithLogo>();
  const noLogo: BrandWithLogo[] = [];

  for (const b of brands) {
    const logo = logoMap[b.name] || null;
    if (!logo) { noLogo.push({ ...b, logo: null }); continue; }
    const existing = byLogoUrl.get(logo);
    if (!existing || b.name.length < existing.name.length) {
      byLogoUrl.set(logo, { ...b, logo });
    }
  }
  return [...byLogoUrl.values(), ...noLogo];
}
import { CartDrawer } from "./CartDrawer";
import { Grain } from "./Grain";

const SOCIAL = {
  instagram: "https://instagram.com/maniagroup.ua",
  telegram: "https://t.me/maniagroup_ua",
};

type SearchHit = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  oldPrice?: number;
  image?: string;
  tone: string;
  inStock?: boolean;
};

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
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};

const SOCIAL_ICONS = {
  instagram:
    "M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm-5 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM17.3 5.9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  telegram:
    "M21.05 3.07 17.6 19.65c-.26 1.16-.94 1.44-1.9.9l-5.26-3.88-2.54 2.45c-.28.28-.52.52-1.06.52l.38-5.4L17.4 5.6c.46-.4-.1-.62-.62-.22L7.1 11.8l-5.26-1.64c-1.14-.36-1.16-1.14.24-1.69L19.66 1.6c.95-.36 1.78.22 1.4 1.47Z",
};

export function Header({ brands = [], brandLogos = {} }: { brands?: Brand[]; brandLogos?: Record<string, string> }) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // Only the homepage has a dark full-bleed hero behind the header, so the
  // transparent/white-text treatment only makes sense there. Everywhere else
  // the header is solid (light bg, dark text) — otherwise it's invisible.
  const overHero = pathname === "/";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { products: SearchHit[] }) => setResults(d.products))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || active !== null || mobileOpen || !overHero;
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
      <header
        onMouseLeave={() => setActive(null)}
        className={`sticky top-0 z-50 transition-colors duration-300 ${
          solid
            ? "border-b border-line bg-paper/95 text-ink backdrop-blur-md"
            : "border-b border-transparent text-paper"
        }`}
      >
        {/* top row — search · wordmark · account/cart */}
        <div className="wrap grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-[72px]">
          <div className="flex items-center">
            <button
              onClick={() => setMobileOpen((v) => { if (v) setMobileExpanded(null); return !v; })}
              className="-ml-1 flex h-9 w-9 items-center justify-center md:hidden"
              aria-label="Меню"
              aria-expanded={mobileOpen}
            >
              <Icon d={mobileOpen ? ICONS.close : ICONS.menu} />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Пошук"
              className="hidden items-center gap-2 text-[11px] uppercase tracking-luxe opacity-75 transition-opacity hover:opacity-100 md:flex"
            >
              <Icon d={ICONS.search} />
              Пошук
            </button>
          </div>

          {/* center — wordmark */}
          <Link
            href="/"
            onMouseEnter={() => setActive(null)}
            className="justify-self-center font-display text-2xl tracking-wordmark md:text-[1.65rem]"
          >
            MANIA&nbsp;GROUP
          </Link>

          {/* right — utilities */}
          <div
            className="flex items-center justify-end gap-5"
            onMouseEnter={() => setActive(null)}
          >
            <a
              href={SOCIAL.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="hidden hover:opacity-60 lg:block"
            >
              <Icon d={SOCIAL_ICONS.instagram} />
            </a>
            <a
              href={SOCIAL.telegram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="hidden hover:opacity-60 lg:block"
            >
              <Icon d={SOCIAL_ICONS.telegram} />
            </a>
            <Link href="/account/profile" aria-label="Акаунт" className="hidden hover:opacity-60 md:block">
              <Icon d={ICONS.user} />
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              aria-label="Кошик"
              className="relative hover:opacity-60"
            >
              <Icon d={ICONS.bag} />
              {cartCount > 0 && (
                <span
                  className={`absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-medium ${
                    solid ? "bg-ink text-paper" : "bg-paper text-ink"
                  }`}
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* nav row — centered (desktop) */}
        <nav
          className={`hidden border-t md:block ${
            solid ? "border-line" : "border-paper/15"
          }`}
        >
          <div className="wrap flex h-12 items-center justify-center gap-9">
            {MEGA_MENU.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onMouseEnter={() => setActive(item.label)}
                onFocus={() => setActive(item.label)}
                onClick={() => setActive(null)}
                className={`link-underline whitespace-nowrap text-[11px] uppercase tracking-luxe transition-opacity ${
                  active === item.label ? "opacity-100" : "opacity-75 hover:opacity-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <a
              href="/delivery"
              onMouseEnter={() => setActive(null)}
              className="link-underline whitespace-nowrap text-[11px] uppercase tracking-luxe opacity-75 hover:opacity-100"
            >
              Доставка
            </a>
          </div>
        </nav>

        {/* mega-menu panel */}
        {active === "Бренди" ? (
          <BrandsPanel brands={brands} logoMap={brandLogos} />
        ) : active ? (
          <MegaPanel item={MEGA_MENU.find((m) => m.label === active)!} />
        ) : null}
      </header>

      {/* mobile menu */}
      {mobileOpen && (
        <nav className="max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-line bg-paper text-ink md:hidden">
          {/* gender tiles */}
          <div className="wrap grid grid-cols-2 gap-3 pt-4">
            {MEGA_MENU.filter((m) => m.label === "Жінкам" || m.label === "Чоловікам").map((item) => (
              <Link
                key={item.label}
                href={item.featured.href ?? item.href}
                onClick={() => setMobileOpen(false)}
                className="group relative block aspect-[3/4] overflow-hidden"
                style={{ backgroundColor: item.featured.tone }}
              >
                {item.featured.image && (
                  <Image
                    src={item.featured.image}
                    alt={item.label}
                    fill
                    sizes="50vw"
                    className="object-cover transition-transform duration-700 group-active:scale-105"
                  />
                )}
                <div
                  className="absolute inset-0"
                  style={{ backgroundImage: "linear-gradient(180deg, rgba(23,19,15,0) 45%, rgba(23,19,15,0.55) 100%)" }}
                />
                <span className="absolute bottom-3 left-3 font-display text-lg text-paper">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>

          {/* expandable groups */}
          <ul className="wrap flex flex-col py-2">
            {MEGA_MENU.filter((m) => m.label !== "Жінкам" && m.label !== "Чоловікам").map((item) => {
              const open = mobileExpanded === item.label;
              return (
                <li key={item.label} className="border-b border-line">
                  <button
                    onClick={() => setMobileExpanded(open ? null : item.label)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between py-3 text-[12px] uppercase tracking-luxe opacity-80"
                  >
                    {item.label}
                    <span className={`transition-transform ${open ? "rotate-45" : ""}`}>
                      <Icon d="M12 5v14M5 12h14" />
                    </span>
                  </button>
                  {open && (
                    <div className="grid grid-cols-2 gap-x-4 pb-4">
                      {item.label === "Бренди"
                        ? orderBrands(brands, brandLogos).map((b) => (
                            <Link
                              key={b.slug}
                              href={`/catalog?brand=${b.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="flex items-center py-1.5"
                            >
                              <BrandLogo
                                name={b.name}
                                src={b.logo}
                                imgClass="h-5 w-auto max-w-[90px] object-contain object-left opacity-80"
                                textClass="text-sm text-ink/80"
                              />
                            </Link>
                          ))
                        : item.columns.flatMap((col) => col.links).map((l) => (
                            <Link
                              key={l.slug}
                              href={l.href ?? `/catalog?category=${l.slug}`}
                              onClick={() => setMobileOpen(false)}
                              className="flex items-center py-1.5"
                            >
                              {l.logo ? (
                                <Image
                                  src={l.logo}
                                  alt={l.label}
                                  width={90}
                                  height={24}
                                  className="h-5 w-auto max-w-[90px] object-contain object-left opacity-80"
                                />
                              ) : (
                                <span className="text-sm text-ink/80">{l.label}</span>
                              )}
                            </Link>
                          ))}
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="col-span-2 mt-1 link-underline text-[11px] uppercase tracking-luxe text-ink"
                      >
                        Усе в «{item.label}» →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
            <li>
              <a
                href="/delivery"
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-[12px] uppercase tracking-luxe opacity-80"
              >
                Доставка
              </a>
            </li>
            <li>
              <a
                href="/contacts"
                onClick={() => setMobileOpen(false)}
                className="block py-3 text-[12px] uppercase tracking-luxe opacity-80"
              >
                Контакти
              </a>
            </li>
          </ul>
          <div className="wrap flex items-center gap-5 border-t border-line py-4">
            <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:opacity-60">
              <Icon d={SOCIAL_ICONS.instagram} />
            </a>
            <a href={SOCIAL.telegram} target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="hover:opacity-60">
              <Icon d={SOCIAL_ICONS.telegram} />
            </a>
          </div>
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
          className={`absolute inset-x-0 top-0 max-h-[85vh] overflow-y-auto bg-paper transition-transform duration-400 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${
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
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              aria-label="Закрити"
              className="text-ink hover:opacity-60"
            >
              <Icon d={ICONS.close} />
            </button>
          </form>

          {query.trim().length >= 2 && (
            <div className="wrap pb-8">
              {searching && results.length === 0 && (
                <p className="py-4 text-sm text-muted">Пошук…</p>
              )}
              {!searching && results.length === 0 && (
                <p className="py-4 text-sm text-muted">Нічого не знайдено за «{query.trim()}»</p>
              )}
              {results.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {results.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/product/${p.slug}`}
                        onClick={() => {
                          setSearchOpen(false);
                          setQuery("");
                        }}
                        className="flex items-center gap-4 py-3 hover:opacity-70"
                      >
                        <div
                          className="relative h-14 w-11 flex-none overflow-hidden bg-line"
                          style={{ backgroundColor: p.tone }}
                        >
                          {p.image && (
                            <Image
                              src={p.image}
                              alt={p.name}
                              fill
                              sizes="44px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] uppercase tracking-luxe text-muted">
                            {p.brand}
                          </p>
                          <p className="truncate text-sm text-ink">{p.name}</p>
                          {p.inStock === false && (
                            <p className="text-[10px] uppercase tracking-luxe text-muted">
                              Немає в наявності
                            </p>
                          )}
                        </div>
                        <div className="flex-none text-right text-sm">
                          {p.oldPrice && (
                            <p className="text-xs text-muted line-through">{formatPrice(p.oldPrice)}</p>
                          )}
                          <p className="text-ink">{formatPrice(p.price)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {results.length > 0 && (
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    router.push(`/catalog?q=${encodeURIComponent(query.trim())}`);
                  }}
                  className="mt-2 w-full border-t border-line py-3 text-center text-[11px] uppercase tracking-luxe text-ink hover:opacity-60"
                >
                  Усі результати →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-line bg-paper/95 backdrop-blur-md md:hidden">
        <Link href="/catalog" className="flex flex-col items-center gap-1 py-2.5 text-ink">
          <Icon d={ICONS.grid} />
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
        <Link href="/account/profile" className="flex flex-col items-center gap-1 py-2.5 text-ink">
          <Icon d={ICONS.user} />
          <span className="text-[9px] uppercase tracking-luxe">Профіль</span>
        </Link>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

function BrandsPanel({ brands, logoMap }: { brands: Brand[]; logoMap: Record<string, string> }) {
  const ordered = orderBrands(brands, logoMap);
  const withLogo = ordered.filter((b) => b.logo);
  const textOnly = ordered.filter((b) => !b.logo);

  return (
    <div className="absolute inset-x-0 top-full hidden border-b border-line bg-paper text-ink shadow-[0_28px_44px_-28px_rgba(23,19,15,0.35)] md:block">
      <div className="wrap py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Наші бренди</p>
            <h3 className="mt-1 font-display text-2xl text-ink">Усі бренди в одному місці</h3>
          </div>
          <Link href="/catalog" className="link-underline whitespace-nowrap text-[11px] uppercase tracking-luxe text-ink">
            Весь каталог →
          </Link>
        </div>

        {/* Logo brands — clean contained tiles (logos are square wordmarks) */}
        {withLogo.length > 0 && (
          <ul className="grid max-h-[52vh] grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5 lg:grid-cols-7">
            {withLogo.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/catalog?brand=${b.slug}`}
                  className="flex h-[72px] items-center justify-center rounded-[3px] border border-line/60 bg-white px-5 transition-all hover:border-ink/25 hover:shadow-[0_4px_14px_-8px_rgba(23,19,15,0.4)]"
                  title={b.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.logo!}
                    alt={b.name}
                    loading="lazy"
                    className="max-h-[44px] max-w-full object-contain"
                    onError={(e) => {
                      // Fall back to a text wordmark when the logo is broken
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                      const span = img.nextElementSibling as HTMLElement | null;
                      if (span) span.style.display = "block";
                    }}
                  />
                  <span className="hidden font-display text-[15px] text-ink/70">{b.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Text-only brands — compact list */}
        {textOnly.length > 0 && (
          <div className={withLogo.length > 0 ? "mt-5 border-t border-line/40 pt-5" : ""}>
            <p className="mb-2 text-[10px] uppercase tracking-luxe text-muted/60">Також</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {textOnly.map((b) => (
                <li key={b.slug}>
                  <Link
                    href={`/catalog?brand=${b.slug}`}
                    className="font-display text-[15px] text-ink/55 transition-colors hover:text-ink"
                  >
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
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
                    href={l.href ?? `/catalog?category=${l.slug}`}
                    className="flex items-center text-sm text-ink/80 transition-colors hover:text-ink"
                  >
                    {l.logo ? (
                      <Image
                        src={l.logo}
                        alt={l.label}
                        width={110}
                        height={28}
                        className="h-7 w-auto max-w-[110px] object-contain object-left opacity-80 transition-opacity hover:opacity-100"
                      />
                    ) : (
                      l.label
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <Link
          href={item.featured.href ?? `/catalog?category=${item.featured.slug}`}
          className="group relative col-start-3 col-end-5 aspect-[16/9] overflow-hidden"
        >
          <div
            className="absolute inset-0 transition-transform duration-[1200ms] ease-out group-hover:scale-105"
            style={{ backgroundColor: item.featured.tone }}
          >
            {item.featured.image && (
              <Image
                src={item.featured.image}
                alt={item.featured.title}
                fill
                sizes="50vw"
                className="object-cover"
              />
            )}
          </div>
          <div
            className="absolute inset-0"
            style={{
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
