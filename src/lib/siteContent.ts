import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { q, q1 } from "./pg";
import { isAdmin } from "./adminAuth";

export type SiteContent = {
  announcement: string;
  announcementFrom: string;
  announcementTo: string;
  footer: {
    about: string;
    columns: { title: string; links: { label: string; href: string }[] }[];
  };
  seo: {
    siteName: string;
    defaultTitle: string;
    titleTemplate: string;
    description: string;
    keywords: string[];
    ogImage: string;
  };
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleAccent: string;
    subtitle: string;
    stats: { value: string; label: string }[];
  };
  services: { title: string; text: string }[];
  homeSections: { id: string; enabled: boolean }[];
  contacts: {
    phone: string;
    email: string;
    instagram: string;
    facebook: string;
    telegram: string;
    address: string;
    workingHours: string;
  };
  about: {
    heroTitle: string;
    heroSubtitle: string;
    story: string;
    guaranteeText: string;
    values: { title: string; text: string }[];
  };
  delivery: {
    subtitle: string;
    cards: { eyebrow: string; title: string; text: string }[];
    paymentNote: string;
    faq: { q: string; a: string }[];
    ctaTitle: string;
  };
  returns: {
    subtitle: string;
    steps: { title: string; text: string }[];
    conditions: string[];
    guaranteeTitle: string;
    guaranteeText: string;
  };
};

export { HOME_SECTIONS } from "./homeSections";

/**
 * Whether the announcement bar should show now. Empty from/to means "no bound".
 * Dates are "YYYY-MM-DD"; lexical comparison is valid for that format.
 */
export function announcementActive(c: SiteContent, now = new Date()): boolean {
  if (!c.announcement.trim()) return false;
  const today = now.toISOString().slice(0, 10);
  if (c.announcementFrom && today < c.announcementFrom) return false;
  if (c.announcementTo && today > c.announcementTo) return false;
  return true;
}

const FILE = path.join(process.cwd(), "data", "site-content.json");

export const DEFAULT_CONTENT: SiteContent = {
  announcement: "Безкоштовна доставка Новою Поштою від 3 000 ₴ · Оригінал гарантовано",
  announcementFrom: "",
  announcementTo: "",
  footer: {
    about:
      "Інтернет-магазин брендового одягу, взуття та аксесуарів. Оригінал, дбайливо відібраний у європейських домів моди.",
    columns: [
      {
        title: "Магазин",
        links: [
          { label: "Жінкам", href: "/catalog?gender=women" },
          { label: "Чоловікам", href: "/catalog?gender=men" },
          { label: "Бренди", href: "/catalog" },
          { label: "Новинки", href: "/catalog?sort=newest" },
          { label: "Sale", href: "/catalog?sort=price_asc" },
        ],
      },
      {
        title: "Допомога",
        links: [
          { label: "Доставка та оплата", href: "/delivery" },
          { label: "Обмін і повернення", href: "/returns" },
          { label: "Контакти", href: "/contacts" },
        ],
      },
      {
        title: "Компанія",
        links: [
          { label: "Про Mania Group", href: "/about" },
          { label: "Гарантія оригіналу", href: "/about" },
        ],
      },
    ],
  },
  seo: {
    siteName: "Mania Group",
    defaultTitle: "Mania Group — брендовий одяг, взуття та аксесуари",
    titleTemplate: "%s — Mania Group",
    description:
      "Інтернет-магазин оригінального брендового одягу, взуття та аксесуарів: EA7 Emporio Armani, Moschino, Antony Morato, MC2 Saint Barth, Harmont & Blaine та інші. Доставка Новою Поштою по всій Україні.",
    keywords: [
      "брендовий одяг",
      "інтернет-магазин одягу",
      "EA7 Emporio Armani",
      "Moschino",
      "Antony Morato",
      "MC2 Saint Barth",
      "Harmont & Blaine",
      "оригінальний одяг Україна",
    ],
    ogImage: "/images/hero.webp",
  },
  hero: {
    eyebrow: "Колекція SS'26 · Україна",
    titleLine1: "Гардероб, що",
    titleAccent: "говорить тихо",
    subtitle:
      "EA7, Moschino, Antony Morato, MC2 Saint Barth та інші — оригінальні речі, дбайливо відібрані у європейських домів моди.",
    stats: [
      { value: "6+", label: "брендів" },
      { value: "100%", label: "оригінал" },
      { value: "1–3 дні", label: "доставка" },
    ],
  },
  services: [
    { title: "Тільки оригінал", text: "Прямі поставки від брендів та офіційних дистриб'юторів" },
    { title: "Доставка по Україні", text: "Новою Поштою — безкоштовно від 3 000 ₴" },
    { title: "Обмін і повернення", text: "14 днів, щоб ухвалити рішення" },
    { title: "Підтримка щодня", text: "+38 (096) 343-60-35 · 9:00–20:00" },
  ],
  homeSections: [
    { id: "hero", enabled: true },
    { id: "marquee", enabled: true },
    { id: "categories", enabled: true },
    { id: "newArrivals", enabled: true },
    { id: "editorial", enabled: true },
    { id: "services", enabled: true },
    { id: "newsletter", enabled: true },
  ],
  contacts: {
    phone: "+38 (096) 343-60-35",
    email: "",
    instagram: "https://instagram.com/maniagroup.ua",
    facebook: "",
    telegram: "https://t.me/maniagroup_ua",
    address: "Україна",
    workingHours: "Щодня · 9:00 — 20:00",
  },
  about: {
    heroTitle: "Магазин, де кожна річ — справжня",
    heroSubtitle:
      "Mania Group — це команда людей, що давно закохані в моду та точно знають, де лежить межа між брендом і підробкою. Ми збираємо кращі колекції європейських марок і доставляємо їх напряму до вас — без посередників та компромісів.",
    story:
      "Ми співпрацюємо виключно з офіційними каналами постачання. Кожен товар супроводжується документами про походження та гарантійним талоном виробника.",
    guaranteeText:
      "За всі роки роботи жодного випадку підробки. Це не лише обіцянка — це єдиний спосіб, яким ми вміємо працювати.",
    values: [
      { title: "Тільки оригінал", text: "Жодних реплік та підробок. Кожна позиція закуповується безпосередньо у брендів або авторизованих дистриб'юторів — з повним пакетом документів." },
      { title: "Перевірка перед відправкою", text: "Кожне замовлення ретельно перевіряється перед пакуванням: автентичність, комплектність, якість упаковки. Тільки після цього воно вирушає до вас." },
      { title: "Прямо від брендів", text: "Ми працюємо напряму з європейськими домами моди та офіційними імпортерами. Це означає актуальні колекції, реальні ціни та повну гарантію виробника." },
      { title: "Дбайлива доставка", text: "Фірмове пакування, тканинний пакет і заводська коробка виробника — все, що захищає товар у дорозі та робить розпакування приємним." },
    ],
  },
  delivery: {
    subtitle: "Відправляємо замовлення по всій Україні Новою Поштою. Безкоштовно — якщо сума від 3 000 ₴.",
    cards: [
      { eyebrow: "Термін відправки", title: "1–2 робочих дні", text: "Підтверджуємо замовлення та відправляємо впродовж двох робочих днів. Трекінг-номер надсилаємо в SMS." },
      { eyebrow: "Перевізник", title: "Нова Пошта", text: "Доставляємо у відділення або поштомат за вашим вибором — по всій Україні, включаючи підконтрольні території." },
      { eyebrow: "Вартість доставки", title: "Безкоштовно від 3 000 ₴", text: "Замовлення на суму від 3 000 ₴ — доставка за наш рахунок. Менша сума — доставку сплачує отримувач за тарифами Нової Пошти." },
      { eyebrow: "Пакування", title: "Дбайливе та захищене", text: "Фірмова упаковка з тканинним пакетом. Взуття та аксесуари — у фабричних коробках виробника." },
    ],
    paymentNote: "Оплата при отриманні готівкою або карткою у відділенні Нової Пошти. Ви можете оглянути замовлення перед оплатою.",
    faq: [
      { q: "Чи можна замовити доставку кур'єром?", a: "Наразі доставляємо лише у відділення або поштомати Нової Пошти. Кур'єрська доставка — у планах." },
      { q: "Чи можна відмовитися від посилки?", a: "Так. Якщо ви передумали або виникла проблема — просто не викупайте посилку у Новій Пошті. Зверніться до нас, і ми вирішимо ситуацію." },
      { q: "Де відстежити посилку?", a: "SMS із трекінг-номером надійде після відправки. Також можна відстежити на сайті novaposhta.ua." },
    ],
    ctaTitle: "Ми відповімо впродовж кількох годин",
  },
  returns: {
    subtitle: "Розмір не підійшов або модель не сподобалась? Не проблема — є 14 днів з дня отримання для обміну або повернення коштів.",
    steps: [
      { title: "Зв'яжіться з нами", text: "Зателефонуйте або напишіть в Instagram упродовж 14 днів з дня отримання. Вкажіть номер замовлення та причину повернення." },
      { title: "Відправте товар", text: "Ми погодимо адресу та спосіб відправки. Товар надсилається Новою Поштою — вартість зворотної доставки оплачує покупець (крім випадків браку)." },
      { title: "Отримайте кошти або обмін", text: "Після отримання та перевірки товару повертаємо кошти на картку або відправляємо обраний розмір/модель. Термін — 1–3 робочих дні." },
    ],
    conditions: [
      "Товар не використовувався — без слідів носіння, запахів, пошкоджень.",
      "Усі етикетки, бирки та оригінальна упаковка збережені.",
      "Взуття повертається у фабричній коробці без подряпин на підошві.",
      "Аксесуари та ювелірні вироби — в оригінальному пакованні з документами.",
      "Парфуми та аромати для дому не підлягають обміну/поверненню, якщо упаковка розкрита — крім випадків заводського браку.",
    ],
    guaranteeTitle: "Брак — наша відповідальність",
    guaranteeText: "Якщо товар прийшов з виробничим дефектом або не відповідає опису — повністю беремо витрати на зворотну доставку та пріоритетно вирішуємо ситуацію. Достатньо надіслати фото дефекту у Instagram або на e-mail.",
  },
};

export const PREVIEW_COOKIE = "mg_preview";
const MAX_VERSIONS = 60;

export type ContentVersion = {
  id: number;
  label: string;
  author: string;
  createdAt: string;
};

/** Read one content slot ('current' | 'draft') from Postgres, merged over defaults. */
async function readSlot(key: "current" | "draft"): Promise<SiteContent | null> {
  const row = await q1<{ val: SiteContent }>("SELECT val FROM content_store WHERE key = $1", [key]);
  if (!row) return null;
  const saved = (typeof row.val === "string" ? JSON.parse(row.val as unknown as string) : row.val) as Partial<SiteContent>;
  return deepMerge(DEFAULT_CONTENT, saved) as SiteContent;
}

async function writeSlot(key: "current" | "draft", content: SiteContent): Promise<void> {
  await q(
    `INSERT INTO content_store(key, val, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()`,
    [key, JSON.stringify(content)],
  );
}

/**
 * One-time migration / seed. If 'current' is absent, seed it from the legacy
 * data/site-content.json (if present) or DEFAULT_CONTENT, so existing prod
 * content is preserved on the first read after the Postgres switch.
 */
async function ensureSeeded(): Promise<SiteContent> {
  const current = await readSlot("current");
  if (current) return current;
  let seed: SiteContent = DEFAULT_CONTENT;
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    seed = deepMerge(DEFAULT_CONTENT, JSON.parse(raw)) as SiteContent;
  } catch {
    /* no legacy file — start from defaults */
  }
  await writeSlot("current", seed);
  return seed;
}

/** Is the current request an admin previewing the unpublished draft? */
async function previewActive(): Promise<boolean> {
  try {
    const jar = await cookies();
    if (jar.get(PREVIEW_COOKIE)?.value !== "1") return false;
    return await isAdmin();
  } catch {
    return false;
  }
}

/**
 * Public content reader used by every page. Returns the published 'current'
 * content — unless the viewer is an admin with preview mode on, in which case
 * the working 'draft' is shown so edits can be checked before publishing.
 * Always falls back to file/defaults if Postgres is unreachable.
 */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    if (await previewActive()) {
      const draft = await readSlot("draft");
      if (draft) return draft;
    }
    return await ensureSeeded();
  } catch {
    try {
      const raw = await fs.readFile(FILE, "utf-8");
      return deepMerge(DEFAULT_CONTENT, JSON.parse(raw)) as SiteContent;
    } catch {
      return DEFAULT_CONTENT;
    }
  }
}

/** Editor reader: the draft if one exists, otherwise the published current. */
export async function getEditableContent(): Promise<SiteContent> {
  const draft = await readSlot("draft");
  if (draft) return draft;
  return ensureSeeded();
}

/** Return the currently published content (ignores draft). */
export async function getPublishedContent(): Promise<SiteContent> {
  return ensureSeeded();
}

/** Save the working draft (autosave). Does not touch the published site. */
export async function saveDraft(content: SiteContent): Promise<void> {
  await writeSlot("draft", content);
}

/**
 * Publish: snapshot the outgoing current into version history, promote the
 * given content to 'current', and clear the draft. Trims old versions.
 */
export async function publishContent(content: SiteContent, label = ""): Promise<void> {
  const outgoing = await readSlot("current");
  if (outgoing) {
    await q(
      `INSERT INTO content_versions(label, content, author) VALUES ($1, $2::jsonb, 'admin')`,
      [label || `Перед публікацією ${new Date().toLocaleString("uk-UA")}`, JSON.stringify(outgoing)],
    );
    await q(
      `DELETE FROM content_versions WHERE id NOT IN (
         SELECT id FROM content_versions ORDER BY created_at DESC LIMIT $1
       )`,
      [MAX_VERSIONS],
    );
  }
  await writeSlot("current", content);
  await q("DELETE FROM content_store WHERE key = 'draft'");
}

/** Discard the working draft (revert to published). */
export async function discardDraft(): Promise<void> {
  await q("DELETE FROM content_store WHERE key = 'draft'");
}

/** Save a named manual snapshot of the given content (a "копія"). */
export async function snapshotContent(content: SiteContent, label: string): Promise<void> {
  await q(
    `INSERT INTO content_versions(label, content, author) VALUES ($1, $2::jsonb, 'admin')`,
    [label || `Копія ${new Date().toLocaleString("uk-UA")}`, JSON.stringify(content)],
  );
  await q(
    `DELETE FROM content_versions WHERE id NOT IN (
       SELECT id FROM content_versions ORDER BY created_at DESC LIMIT $1
     )`,
    [MAX_VERSIONS],
  );
}

/** List version snapshots, newest first (metadata only). */
export async function listVersions(): Promise<ContentVersion[]> {
  const rows = await q<{ id: string; label: string; author: string; created_at: string }>(
    "SELECT id, label, author, created_at FROM content_versions ORDER BY created_at DESC",
  );
  return rows.map((r) => ({ id: Number(r.id), label: r.label, author: r.author, createdAt: r.created_at }));
}

/** Full content of one version (for restore/preview). */
export async function getVersion(id: number): Promise<SiteContent | null> {
  const row = await q1<{ content: SiteContent }>("SELECT content FROM content_versions WHERE id = $1", [id]);
  if (!row) return null;
  const c = typeof row.content === "string" ? JSON.parse(row.content as unknown as string) : row.content;
  return deepMerge(DEFAULT_CONTENT, c) as SiteContent;
}

/** Load a version into the working draft so it can be previewed then published. */
export async function restoreVersionToDraft(id: number): Promise<SiteContent | null> {
  const content = await getVersion(id);
  if (!content) return null;
  await writeSlot("draft", content);
  return content;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  if (typeof base !== "object" || base === null) return override ?? base;
  if (Array.isArray(base)) return Array.isArray(override) ? override : base;
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (key in result) {
      result[key] = deepMerge(result[key], override[key]);
    }
  }
  return result;
}
