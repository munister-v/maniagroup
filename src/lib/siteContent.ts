import { promises as fs } from "fs";
import path from "path";

export type SiteContent = {
  announcement: string;
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleAccent: string;
    subtitle: string;
  };
  services: { title: string; text: string }[];
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

const FILE = path.join(process.cwd(), "data", "site-content.json");

export const DEFAULT_CONTENT: SiteContent = {
  announcement: "Безкоштовна доставка Новою Поштою від 3 000 ₴ · Оригінал гарантовано",
  hero: {
    eyebrow: "Колекція SS'26 · Україна",
    titleLine1: "Гардероб, що",
    titleAccent: "говорить тихо",
    subtitle:
      "EA7, Moschino, Antony Morato, MC2 Saint Barth та інші — оригінальні речі, дбайливо відібрані у європейських домів моди.",
  },
  services: [
    { title: "Тільки оригінал", text: "Прямі поставки від брендів та офіційних дистриб'юторів" },
    { title: "Доставка по Україні", text: "Новою Поштою — безкоштовно від 3 000 ₴" },
    { title: "Обмін і повернення", text: "14 днів, щоб ухвалити рішення" },
    { title: "Підтримка щодня", text: "+38 (096) 343-60-35 · 9:00–20:00" },
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

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const saved = JSON.parse(raw) as Partial<SiteContent> & Record<string, unknown>;
    return deepMerge(DEFAULT_CONTENT, saved) as SiteContent;
  } catch {
    return DEFAULT_CONTENT;
  }
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(content, null, 2), "utf-8");
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
