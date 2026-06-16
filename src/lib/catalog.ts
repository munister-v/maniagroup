// Mock catalog for the redesign demo.
// Structured to map cleanly onto a real headless source (WooCommerce Store API
// / Medusa) once we have backend access — products keep id/slug/brand/category.

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

/** Catalog href filtered to a single brand (mirrors brandSlug in productSource). */
export function brandHref(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `/catalog?brand=${slug}`;
}

export const NAV: { label: string; href: string }[] = [
  { label: "Бренди", href: "#brands" },
  { label: "Жінкам", href: "#women" },
  { label: "Чоловікам", href: "#men" },
  { label: "Аромати для дому", href: "#home" },
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
  {
    label: "Аромати для дому",
    caption: "Дифузори · інтер'єрні парфуми · сашле",
    href: "/catalog?category=aromatizatory",
    tone: "#cbb8a4",
    image: "/images/cat-home.webp",
  },
];

export const PRODUCTS: Product[] = [
  {
    id: "p01",
    slug: "ea7-core-id-jacket",
    name: "Куртка Core ID",
    brand: "EA7 Emporio Armani",
    price: 12900,
    oldPrice: 16400,
    gender: "men",
    category: "Верхній одяг",
    tone: "#c9bdab",
    tag: "sale",
  },
  {
    id: "p02",
    slug: "moschino-logo-tape-dress",
    name: "Сукня Logo Tape",
    brand: "Moschino",
    price: 18700,
    gender: "women",
    category: "Одяг",
    tone: "#cbbfbd",
    tag: "new",
  },
  {
    id: "p03",
    slug: "antony-morato-slim-shirt",
    name: "Сорочка Slim Fit",
    brand: "Antony Morato",
    price: 4200,
    gender: "men",
    category: "Одяг",
    tone: "#e3ddd1",
  },
  {
    id: "p04",
    slug: "harmont-blaine-vintage-polo",
    name: "Поло Vintage Dog",
    brand: "Harmont & Blaine",
    price: 5600,
    gender: "men",
    category: "Одяг",
    tone: "#c4c2ac",
  },
  {
    id: "p05",
    slug: "mc2-saint-barth-swim-shorts",
    name: "Шорти Beachwear",
    brand: "MC2 Saint Barth",
    price: 6300,
    gender: "men",
    category: "Пляжний одяг",
    tone: "#dccfb6",
    tag: "new",
  },
  {
    id: "p06",
    slug: "kocca-midi-dress",
    name: "Сукня Midi",
    brand: "Kocca",
    price: 7900,
    gender: "women",
    category: "Одяг",
    tone: "#cbb8a4",
  },
  {
    id: "p07",
    slug: "ea7-track-suit",
    name: "Спортивний костюм",
    brand: "EA7 Emporio Armani",
    price: 11400,
    gender: "women",
    category: "Спорт",
    tone: "#c4bcb0",
  },
  {
    id: "p08",
    slug: "fred-mello-hidden-puffer",
    name: "Пуховик Hidden",
    brand: "Fred Mello",
    price: 14200,
    oldPrice: 17800,
    gender: "women",
    category: "Верхній одяг",
    tone: "#d6d3cc",
    tag: "sale",
  },
  {
    id: "p09",
    slug: "jb4-slim-jeans",
    name: "Джинси Slim",
    brand: "J.B4",
    price: 3900,
    gender: "men",
    category: "Одяг",
    tone: "#cfc7bd",
  },
  {
    id: "p10",
    slug: "moschino-home-diffuser",
    name: "Дифузор для дому",
    brand: "Moschino",
    price: 3400,
    gender: "home",
    category: "Аромати для дому",
    tone: "#dfdbd2",
    tag: "new",
  },
  {
    id: "p11",
    slug: "harmont-blaine-low-sneakers",
    name: "Кросівки Low",
    brand: "Harmont & Blaine",
    price: 8800,
    gender: "men",
    category: "Взуття",
    tone: "#e3ddd1",
  },
  {
    id: "p12",
    slug: "kocca-mini-bag",
    name: "Сумка Mini",
    brand: "Kocca",
    price: 6900,
    gender: "women",
    category: "Аксесуари",
    tone: "#cbbfbd",
    tag: "last",
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
    href: "/catalog",
    columns: [
      {
        title: "Популярні",
        links: [
          { label: "EA7 Emporio Armani", slug: "ea7", href: "/catalog?brandGroup=ea7", logo: "/images/brands/ea7-emporio-armani.png" },
          { label: "Moschino", slug: "moschino-love", href: "/catalog?brandGroup=moschino", logo: "/images/brands/moschino.png" },
          { label: "Antony Morato", slug: "antony-morato", href: "/catalog?brand=antony-morato", logo: "/images/brands/antony-morato.png" },
          { label: "Harmont & Blaine", slug: "harmont-blaine", href: "/catalog?brand=harmont-blaine", logo: "/images/brands/harmont-blaine.png" },
        ],
      },
      {
        title: "Ще бренди",
        links: [
          { label: "MC2 Saint Barth", slug: "mc2-saint-barth", href: "/catalog?brand=mc2-saint-barth", logo: "/images/brands/mc2-saint-barth.png" },
          { label: "Fred Mello", slug: "fred-mello", href: "/catalog?brand=fred-mello", logo: "/images/brands/fred-mello.png" },
          { label: "J.B4", slug: "j-b4-just-before", href: "/catalog?brand=j-b4-just-before" },
          { label: "Kocca", slug: "kocca", href: "/catalog?brand=kocca" },
        ],
      },
    ],
    featured: { title: "J.B4 · SS’26", caption: "Нова колекція", tone: "#c9bdab", slug: "j-b4-just-before", href: "/catalog?brand=j-b4-just-before", image: "/images/01_dropdown-season-ss26.webp" },
  },
  {
    label: "Жінкам",
    href: "/catalog?gender=women",
    columns: [
      {
        title: "Одяг",
        links: [
          { label: "Сукні", slug: "zhenskie-platya" },
          { label: "Верхній одяг", slug: "zhenskaya-verhniaya-odezhda" },
          { label: "Спортивний одяг", slug: "muzhskaya-sportivnaya-odezhda-zhenskoe" },
          { label: "Пляжний одяг", slug: "plyazh-jenskoe" },
        ],
      },
      {
        title: "Взуття та аксесуари",
        links: [
          { label: "Взуття", slug: "zhenskaya-obuv" },
          { label: "Сумки", slug: "zhenskie-sumki-i-ryukzaki" },
          { label: "Аксесуари", slug: "aksessuaryi" },
          { label: "Білизна", slug: "spidnia-bilyzna-zhenskaya-odezhda" },
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
          { label: "Сорочки", slug: "muzhskie-rubashki" },
          { label: "Поло", slug: "muzhskie-polo" },
          { label: "Верхній одяг", slug: "muzhskaya-verhnyaya-odezhda" },
          { label: "Спортивний одяг", slug: "muzhskaya-sportivnaya-odezhda" },
        ],
      },
      {
        title: "Взуття та аксесуари",
        links: [
          { label: "Взуття", slug: "muzhskaya-obuv" },
          { label: "Аксесуари", slug: "muzhskie-aksessuaryi" },
          { label: "Пляжний одяг", slug: "plyazh-mujskoe" },
          { label: "Сумки", slug: "muzhskie-sumki" },
        ],
      },
    ],
    featured: { title: "Чоловіча колекція", caption: "Дивитися все", tone: "#c4bcb0", slug: "muzhskoe", href: "/catalog?gender=men", image: "/images/03_dropdown-cholovicha-kolektsiya.webp" },
  },
  {
    label: "Аромати для дому",
    href: "/catalog?category=aromatizatory",
    columns: [
      {
        title: "Категорії",
        links: [
          { label: "Дифузори", slug: "aromadiffuzory" },
          { label: "Інтер’єрні парфуми", slug: "interyernyye_dukhi" },
          { label: "Змінні блоки", slug: "smennyye_bloki" },
          { label: "Сашле", slug: "aromaticheskiye_sashe" },
        ],
      },
    ],
    featured: { title: "Аромати для дому", caption: "Новинки", tone: "#cbb8a4", slug: "aromatizatory", image: "/images/04_dropdown-aromaty-dlya-domu.webp" },
  },
];

export type CartLine = { product: Product; size: string; qty: number };

export const SAMPLE_CART: CartLine[] = [
  { product: PRODUCTS[0], size: "M", qty: 1 },
  { product: PRODUCTS[1], size: "S", qty: 1 },
];
