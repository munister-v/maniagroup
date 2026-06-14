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
};

const FILE = path.join(process.cwd(), "data", "site-content.json");

export const DEFAULT_CONTENT: SiteContent = {
  announcement: "Безкоштовна доставка Новою Поштою від 3 000 ₴ · Оригінал гарантовано",
  hero: {
    eyebrow: "Колекція SS’26 · Україна",
    titleLine1: "Гардероб, що",
    titleAccent: "говорить тихо",
    subtitle:
      "EA7, Moschino, Antony Morato, MC2 Saint Barth та інші — оригінальні речі, дбайливо відібрані у європейських домів моди.",
  },
  services: [
    { title: "Тільки оригінал", text: "Прямі поставки від брендів та офіційних дистриб’юторів" },
    { title: "Доставка по Україні", text: "Новою Поштою — безкоштовно від 3 000 ₴" },
    { title: "Обмін і повернення", text: "14 днів, щоб ухвалити рішення" },
    { title: "Підтримка щодня", text: "+38 (096) 343-60-35 · 9:00–20:00" },
  ],
};

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const saved = JSON.parse(raw) as Partial<SiteContent> & Record<string, unknown>;
    return {
      ...DEFAULT_CONTENT,
      ...saved,
      hero: { ...DEFAULT_CONTENT.hero, ...(saved.hero ?? {}) },
      services: (saved.services as SiteContent["services"] | undefined) ?? DEFAULT_CONTENT.services,
    };
  } catch {
    return DEFAULT_CONTENT;
  }
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(content, null, 2), "utf-8");
}
