import { promises as fs } from "fs";
import path from "path";

export type JournalEntry = {
  id: string;
  kicker: string;
  title: string;
  read: string;
  tone: string;
};

export type SiteContent = {
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleAccent: string;
    subtitle: string;
  };
  journal: JournalEntry[];
};

const FILE = path.join(process.cwd(), "data", "site-content.json");

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: "Колекція SS’26 · Україна",
    titleLine1: "Гардероб, що",
    titleAccent: "говорить тихо",
    subtitle:
      "EA7, Moschino, Antony Morato, MC2 Saint Barth та інші — оригінальні речі, дбайливо відібрані у європейських домів моди.",
  },
  journal: [
    { id: "j1", kicker: "Стиль", title: "Капсульний гардероб на сезон: сім речей, що працюють разом", read: "5 хв", tone: "#c4bcb0" },
    { id: "j2", kicker: "Бренди", title: "MC2 Saint Barth: історія рив’єрного стилю з острова", read: "4 хв", tone: "#b9ae9b" },
    { id: "j3", kicker: "Догляд", title: "Як доглядати за преміальним трикотажем удома", read: "3 хв", tone: "#cbb8a4" },
  ],
};

export async function getSiteContent(): Promise<SiteContent> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    return { ...DEFAULT_CONTENT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONTENT;
  }
}

export async function saveSiteContent(content: SiteContent): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(content, null, 2), "utf-8");
}
