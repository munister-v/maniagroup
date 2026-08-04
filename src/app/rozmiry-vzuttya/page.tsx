import Link from "next/link";
import { Reveal } from "@/components/Reveal";

export const metadata = {
  title: "Таблиця розмірів взуття",
  alternates: { canonical: "/rozmiry-vzuttya" },
  description:
    "Розмірні таблиці взуття: жіноче, чоловіче, дитяче та підліткове. Відповідність італійського та європейського розміру довжині стопи в сантиметрах.",
};

/**
 * Публічна таблиця розмірів взуття.
 *
 * Числа — це фактична відповідність розміру довжині стопи, галузевий стандарт
 * італійського/європейського розмірного ряду. Тексти й пояснення власні.
 *
 * Аксесуари свідомо не додаємо — у них своя логіка розмірів (обхват голови,
 * довжина ременя), і зводити їх у ту саму таблицю було б неправильно.
 */

type SizeTable = {
  id: string;
  title: string;
  note: string;
  /** Підпис першого рядка — у дітей ряд європейський, у дорослих італійський. */
  sizeLabel: string;
  sizes: string[];
  cm: string[];
};

const TABLES: SizeTable[] = [
  {
    id: "women",
    title: "Жіноче взуття",
    note: "Італійський розмірний ряд — саме він вказаний на коробках більшості брендів, з якими ми працюємо.",
    sizeLabel: "Розмір (IT)",
    sizes: ["34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "42"],
    cm: ["21.5", "22", "22.5", "22.7", "23", "23.5", "24", "24.3", "24.5", "24.7", "25", "25.2", "25.5", "26", "26.5", "27"],
  },
  {
    id: "men",
    title: "Чоловіче взуття",
    note: "Італійський розмірний ряд. Піврозміри трапляються не в усіх моделей — якщо вашого немає, беріть найближчий більший.",
    sizeLabel: "Розмір (IT)",
    sizes: ["39", "40", "40.5", "41", "42", "43", "43.5", "44", "45", "46", "46.5", "47", "48"],
    cm: ["25", "25.5", "26", "26.5", "27", "27.5", "28", "28.5", "29", "29.5", "30", "30.5", "31"],
  },
  {
    id: "kids",
    title: "Дитяче взуття",
    note: "Європейський ряд. Дитяча стопа росте швидко, тому закладайте 5–10 мм запасу.",
    sizeLabel: "Розмір (EU)",
    sizes: ["15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"],
    cm: ["10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14.5", "15.5", "16", "16.5", "17", "18", "18.5", "19", "19.5"],
  },
  {
    id: "teen",
    title: "Підліткове взуття",
    note: "Європейський ряд. Від 38-го розміру діапазон уже перетинається з дорослим.",
    sizeLabel: "Розмір (EU)",
    sizes: ["32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43"],
    cm: ["20", "21", "21.5", "22.5", "23", "24", "24.5", "25", "25.5", "26", "26.5", "27"],
  },
];

const STEPS = [
  {
    n: "01",
    title: "Поставте ногу на аркуш",
    text: "Аркуш притисніть до стіни, п'ятою впріться в неї. Міряйте стоячи — під вагою тіла стопа довша, ніж сидячи.",
  },
  {
    n: "02",
    title: "Позначте найдовший палець",
    text: "Олівець тримайте вертикально. Найдовшим не завжди є великий палець — орієнтуйтеся на фактичний контур.",
  },
  {
    n: "03",
    title: "Виміряйте відстань",
    text: "Від краю аркуша до позначки, у сантиметрах. Міряйте ввечері: за день стопа трохи набрякає.",
  },
  {
    n: "04",
    title: "Звірте з таблицею",
    text: "Якщо значення між двома розмірами — беріть більший. Обидві ноги бувають різні, орієнтуйтеся на більшу.",
  },
];

function Table({ t }: { t: SizeTable }) {
  return (
    <Reveal>
      <div className="border border-line bg-paper">
        <div className="border-b border-line px-6 py-5 md:px-8">
          <h2 className="font-display text-2xl text-ink">{t.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t.note}</p>
        </div>

        {/* Ряд довгий — на вузькому екрані таблиця гортається всередині себе,
            щоб не тягнути горизонтальний скрол усієї сторінки. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <tbody>
              <tr className="border-b border-line">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-cloud/60 px-5 py-3 text-left text-[11px] uppercase tracking-luxe text-muted"
                >
                  {t.sizeLabel}
                </th>
                {t.sizes.map((s) => (
                  <td key={s} className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-ink">
                    {s}
                  </td>
                ))}
              </tr>
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-cloud/60 px-5 py-3 text-left text-[11px] uppercase tracking-luxe text-muted"
                >
                  Стопа, см
                </th>
                {t.cm.map((c, i) => (
                  <td key={i} className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-muted">
                    {c}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Reveal>
  );
}

export default function ShoeSizesPage() {
  return (
    <div>
      <div className="border-b border-line bg-cloud/40">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / Розміри взуття
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink md:text-5xl lg:text-6xl">Розміри взуття</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Італійські бренди маркують взуття власним розмірним рядом, тому найнадійніше
            орієнтуватися не на звичний вам номер, а на довжину стопи в сантиметрах.
          </p>
        </div>
      </div>

      <section className="wrap space-y-8 py-14 md:py-20">
        {TABLES.map((t) => (
          <Table key={t.id} t={t} />
        ))}
      </section>

      <section className="border-t border-line bg-cloud/30">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Як виміряти</p>
          <h2 className="mt-3 font-display text-3xl text-ink md:text-4xl">Довжина стопи за чотири кроки</h2>

          <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
            {STEPS.map((s) => (
              <Reveal key={s.n}>
                <div className="h-full bg-paper p-8 md:p-10">
                  <p className="font-display text-3xl text-ink/20">{s.n}</p>
                  <h3 className="mt-3 text-base text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-10 max-w-2xl text-sm leading-relaxed text-muted">
            Розміри навіть в одного бренду можуть відрізнятися залежно від моделі та колодки.
            Якщо сумніваєтесь — напишіть нам, ми підкажемо по конкретній парі.{" "}
            <Link href="/contacts" className="link-underline text-ink">Контакти</Link>
            {" · "}
            <Link href="/returns" className="link-underline text-ink">Умови обміну</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
