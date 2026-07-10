// NOT a product data layer — real products/stock/price live in Postgres via
// lib/products.ts (admin CRUD) and lib/productSource.ts (storefront reads).
// This file is static storefront config only: nav, mega-menu, brand→logo
// maps, journal teasers, and small formatting helpers (formatPrice,
// discountPercent, brandMark) shared across storefront components.

export type Gender = "women" | "men" | "home";
export type Tag = "new" | "sale" | "last";

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number; // UAH
  oldPrice?: number;
  gender: Gender;
  category: string;
  tone: string; // placeholder tile colour until real photography lands
  tag?: Tag;
  image?: string; // real product photo, when available
  categorySlug?: string;
  inStock?: boolean; // false → archived ("Немає в наявності")
  color?: string;
  composition?: string;
  season?: string;
};

export const BRANDS = [
  "EA7 Emporio Armani",
  "Moschino",
  "Antony Morato",
  "Harmont & Blaine",
  "MC2 Saint Barth",
  "Fred Mello",
  "J.B4",
  "Kocca",
];

/** Brand name → transparent PNG logo in /public/images/brands. Missing = render text. */
export const BRAND_LOGOS: Record<string, string> = {
  "EA7 Emporio Armani": "/images/brands/ea7-emporio-armani.png",
  Moschino: "/images/brands/moschino.png",
  "Antony Morato": "/images/brands/antony-morato.png",
  "Harmont & Blaine": "/images/brands/harmont-blaine.png",
  "MC2 Saint Barth": "/images/brands/mc2-saint-barth.png",
  "Fred Mello": "/images/brands/fred-mello.png",
};

/**
 * Logo lookup keyed by the EXACT brand name as stored in the DB (`products.brand`).
 * Used by the homepage strip and the header brands menu so the right PNG renders
 * for the real catalog brands. Brands without an entry render as styled text.
 */
export const BRAND_LOGO_BY_DBNAME: Record<string, string> = {
  EA7: "/images/brands/ea7-emporio-armani.png",
  "EA7 Swim": "/images/brands/ea7-emporio-armani.png",
  "MOSCHINO Love": "/images/brands/moschino.png",
  "ANTONY MORATO": "/images/brands/antony-morato.png",
  "HARMONT&BLAINE": "/images/brands/harmont-blaine.png",
  "MC2 SAINT BARTH": "/images/brands/mc2-saint-barth.png",
  "FRED MELLO": "/images/brands/fred-mello.png",
};

/** Brands sorted logo-first (then by original order) for marquee/menus. */
export function brandsLogoFirst<T extends { name: string }>(brands: T[]): T[] {
  return [...brands].sort((a, b) => {
    const la = BRAND_LOGO_BY_DBNAME[a.name] ? 0 : 1;
    const lb = BRAND_LOGO_BY_DBNAME[b.name] ? 0 : 1;
    return la - lb;
  });
}

/** Catalog href filtered to a single brand (mirrors brandSlug in productSource). */
export function brandHref(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `/catalog?brand=${slug}`;
}

export const NAV: { label: string; href: string }[] = [
  { label: "Бренди", href: "#brands" },
  { label: "Жінкам", href: "#women" },
  { label: "Чоловікам", href: "#men" },
  { label: "Доставка", href: "#delivery" },
];

export const CATEGORIES: {
  label: string;
  caption: string;
  href: string;
  tone: string;
  image: string;
}[] = [
  {
    label: "Жінкам",
    caption: "Сукні · верхній одяг · взуття · аксесуари",
    href: "/catalog?category=zhenskoe",
    tone: "#d8cfc1",
    image: "/images/cat-women.webp",
  },
  {
    label: "Чоловікам",
    caption: "Сорочки · поло · костюми · взуття",
    href: "/catalog?category=muzhskoe",
    tone: "#c4bcb0",
    image: "/images/cat-men.webp",
  },
];

export const TAG_LABELS: Record<Tag, string> = {
  new: "Новинка",
  sale: "Sale",
  last: "Останній розмір",
};

/** Discount percentage for a product with an oldPrice, e.g. 20 for "-20%". */
export function discountPercent(p: Product): number | null {
  if (!p.oldPrice || p.oldPrice <= p.price) return null;
  return Math.round((1 - p.price / p.oldPrice) * 100);
}

export function formatPrice(uah: number): string {
  return uah.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₴";
}

/** First-letter monogram for the placeholder tile, e.g. "MC2 Saint Barth" → "MS". */
export function brandMark(brand: string): string {
  return brand
    .split(/\s+/)
    .filter((w) => /[a-zа-яёіїєґ]/i.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const SWATCH_PALETTE = [
  "#17130f",
  "#7a5c3e",
  "#b9ae9b",
  "#c9bdab",
  "#8c8174",
  "#d8cfc1",
  "#3b352e",
  "#9c8f7d",
];

/** Deterministic colour swatches for a product card. */
export function productSwatches(p: Product): string[] {
  const seed = (p.id.charCodeAt(1) || 0) + (p.id.charCodeAt(2) || 0);
  return [0, 1, 2].map((i) => SWATCH_PALETTE[(seed + i * 3) % SWATCH_PALETTE.length]);
}

export const JOURNAL: {
  id: string;
  kicker: string;
  title: string;
  read: string;
  tone: string;
}[] = [
  {
    id: "j1",
    kicker: "Стиль",
    title: "Капсульний гардероб на сезон: сім речей, що працюють разом",
    read: "5 хв",
    tone: "#c4bcb0",
  },
  {
    id: "j2",
    kicker: "Бренди",
    title: "MC2 Saint Barth: історія рив’єрного стилю з острова",
    read: "4 хв",
    tone: "#b9ae9b",
  },
  {
    id: "j3",
    kicker: "Догляд",
    title: "Як доглядати за преміальним трикотажем удома",
    read: "3 хв",
    tone: "#cbb8a4",
  },
];

export type MegaMenu = {
  label: string;
  href: string;
  columns: { title: string; links: { label: string; slug: string; logo?: string; href?: string }[] }[];
  featured: { title: string; caption: string; tone: string; slug: string; image?: string; href?: string };
};

export const MEGA_MENU: MegaMenu[] = [
  {
    label: "Бренди",
    href: "/brands",
    columns: [],
    featured: { title: "Усі бренди", caption: "Переглянути", tone: "#c9bdab", slug: "brands", href: "/brands" },
  },
  {
    label: "Жінкам",
    href: "/catalog?gender=women",
    columns: [
      {
        title: "Одяг",
        links: [
          { label: "Сукні",          slug: "plate",          href: "/catalog?category=plate" },
          { label: "Блузи та топи",  slug: "bluza",          href: "/catalog?category=bluza" },
          { label: "Футболки",       slug: "futbolka",       href: "/catalog?category=futbolka&gender=women" },
          { label: "Джинси",         slug: "dzhinsy",        href: "/catalog?category=dzhinsy&gender=women" },
          { label: "Штани",          slug: "bryuki",         href: "/catalog?category=bryuki&gender=women" },
          { label: "Спідниці",       slug: "yubka",          href: "/catalog?category=yubka" },
          { label: "Светри",         slug: "sviter",         href: "/catalog?category=sviter&gender=women" },
          { label: "Куртки",         slug: "kurtka",         href: "/catalog?category=kurtka&gender=women" },
          { label: "Пальта",         slug: "palto",          href: "/catalog?category=palto" },
        ],
      },
      {
        title: "Спорт та відпочинок",
        links: [
          { label: "Спорткостюм",    slug: "sportivnyi-kostyum", href: "/catalog?category=sportivnyi-kostyum&gender=women" },
          { label: "Шорти",          slug: "shorty",         href: "/catalog?category=shorty&gender=women" },
          { label: "Купальники",     slug: "kupalnik",       href: "/catalog?category=kupalnik" },
        ],
      },
      {
        title: "Сумки та аксесуари",
        links: [
          { label: "Сумки",          slug: "sumka",          href: "/catalog?category=sumka" },
          { label: "Пояси",          slug: "remen",          href: "/catalog?category=remen" },
          { label: "Шапки",          slug: "shapka",         href: "/catalog?category=shapka" },
        ],
      },
      {
        title: "Білизна",
        links: [
          { label: "Бюстгалтери",    slug: "byustgalter",    href: "/catalog?category=byustgalter" },
          { label: "Труси",          slug: "trusy",          href: "/catalog?category=trusy" },
        ],
      },
    ],
    featured: { title: "Жіноча колекція", caption: "Дивитися все", tone: "#d8cfc1", slug: "zhenskoe", href: "/catalog?gender=women", image: "/images/02_dropdown-zhinocha-kolektsiya.webp" },
  },
  {
    label: "Чоловікам",
    href: "/catalog?gender=men",
    columns: [
      {
        title: "Одяг",
        links: [
          { label: "Футболки",       slug: "futbolka-m",     href: "/catalog?category=futbolka&gender=men" },
          { label: "Сорочки",        slug: "rubashka",       href: "/catalog?category=rubashka" },
          { label: "Поло",           slug: "polo",           href: "/catalog?category=polo" },
          { label: "Джинси",         slug: "dzhinsy-m",      href: "/catalog?category=dzhinsy&gender=men" },
          { label: "Штани",          slug: "bryuki-m",       href: "/catalog?category=bryuki&gender=men" },
          { label: "Светри",         slug: "sviter-m",       href: "/catalog?category=sviter&gender=men" },
          { label: "Куртки",         slug: "kurtka-m",       href: "/catalog?category=kurtka&gender=men" },
          { label: "Піджаки",        slug: "zhaket",         href: "/catalog?category=zhaket" },
        ],
      },
      {
        title: "Спорт та відпочинок",
        links: [
          { label: "Спорткостюм",    slug: "sportivnyi-kostyum-m", href: "/catalog?category=sportivnyi-kostyum&gender=men" },
          { label: "Шорти",          slug: "shorty-m",       href: "/catalog?category=shorty&gender=men" },
          { label: "Плавки",         slug: "plav-shorty",    href: "/catalog?category=plav-shorty" },
        ],
      },
      {
        title: "Аксесуари",
        links: [
          { label: "Сумки",          slug: "sumka-m",        href: "/catalog?category=sumka&gender=men" },
          { label: "Пояси",          slug: "remen-m",        href: "/catalog?category=remen" },
          { label: "Шапки",          slug: "shapka-m",       href: "/catalog?category=shapka" },
          { label: "Гаманці",        slug: "koshelek",       href: "/catalog?category=koshelek" },
        ],
      },
    ],
    featured: { title: "Чоловіча колекція", caption: "Дивитися все", tone: "#c4bcb0", slug: "muzhskoe", href: "/catalog?gender=men", image: "/images/03_dropdown-cholovicha-kolektsiya.webp" },
  },
];

/** The real, site-navigation-defined category taxonomy (category_slug + label
 *  + which genders it applies to), derived straight from MEGA_MENU so the
 *  admin product editor's category picker can never drift out of sync with
 *  what the storefront nav actually links to. */
export type CategoryOption = { slug: string; label: string; genders: ("men" | "women")[] };

export const PRODUCT_CATEGORIES: CategoryOption[] = (() => {
  const map = new Map<string, { label: string; genders: Set<"men" | "women"> }>();
  for (const menu of MEGA_MENU) {
    const menuGender = menu.label === "Жінкам" ? "women" : menu.label === "Чоловікам" ? "men" : null;
    if (!menuGender) continue;
    for (const col of menu.columns) {
      for (const link of col.links) {
        const qs = new URLSearchParams(link.href?.split("?")[1] ?? "");
        const slug = qs.get("category");
        if (!slug) continue;
        const gender = (qs.get("gender") as "men" | "women" | null) ?? menuGender;
        const entry = map.get(slug) ?? { label: link.label, genders: new Set<"men" | "women">() };
        entry.genders.add(gender);
        map.set(slug, entry);
      }
    }
  }
  return [...map.entries()]
    .map(([slug, v]) => ({ slug, label: v.label, genders: [...v.genders] }))
    .sort((a, b) => a.label.localeCompare(b.label, "uk"));
})();

