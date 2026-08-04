import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { listPublicSizeCharts, SIZE_CHART_TYPES, type SizeChart } from "@/lib/sizeCharts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Таблиця розмірів взуття",
  alternates: { canonical: "/rozmiry-vzuttya" },
  description:
    "Розмірні таблиці взуття: жіноче, чоловіче, дитяче та підліткове. Відповідність італійського та європейського розміру довжині стопи в сантиметрах.",
};

/**
 * Публічна сторінка розмірів взуття.
 *
 * Джерело даних — розмірні сітки з адмінки (`size_charts`, позначені
 * `public_order`), тому клієнт правит таблиці сам, без деплою. Сторінка нічого
 * не вигадує: якщо сітку не позначили до показу — її тут не буде.
 *
 * Аксесуари свідомо не виводимо: у них своя логіка (обхват голови, довжина
 * ременя), і в таблиці «розмір ↔ стопа» їм не місце.
 */

const SHOE_PROPS = SIZE_CHART_TYPES.find((t) => t.value === "shoes")?.properties ?? [];

/** Колонка показується, лише якщо хоч в одному рядку вона заповнена. */
function usedProps(chart: SizeChart) {
  return SHOE_PROPS.filter((p) => chart.chart.some((r) => (r[p.key] ?? "").trim() !== ""));
}

function ChartTable({ chart }: { chart: SizeChart }) {
  const props = usedProps(chart);
  const rows = chart.chart.filter((r) => (r.size ?? "").trim() !== "");
  if (rows.length === 0) return null;

  return (
    <Reveal>
      <div className="border border-line bg-paper">
        <div className="border-b border-line px-6 py-5 md:px-8">
          <h2 className="font-display text-2xl text-ink">{chart.name || chart.code}</h2>
          {chart.public_note && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{chart.public_note}</p>
          )}
        </div>

        {/* Ряд довгий — таблиця гортається всередині себе, щоб не тягнути
            горизонтальний скрол усієї сторінки. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <tbody>
              <tr className="border-b border-line">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-cloud/60 px-5 py-3 text-left text-[11px] uppercase tracking-luxe text-muted"
                >
                  Розмір
                </th>
                {rows.map((r, i) => (
                  <td key={i} className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-ink">
                    {r.size}
                  </td>
                ))}
              </tr>
              {props.map((p) => (
                <tr key={p.key} className="border-b border-line last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-r border-line bg-cloud/60 px-5 py-3 text-left text-[11px] uppercase tracking-luxe text-muted"
                  >
                    {p.label}
                  </th>
                  {rows.map((r, i) => (
                    <td key={i} className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-muted">
                      {r[p.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Reveal>
  );
}

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

export default async function ShoeSizesPage() {
  const charts = await listPublicSizeCharts("shoes").catch(() => []);

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

      {charts.length > 0 && (
        <section className="wrap space-y-8 py-14 md:py-20">
          {charts.map((c) => (
            <ChartTable key={c.id} chart={c} />
          ))}
        </section>
      )}

      <section className={charts.length > 0 ? "border-t border-line bg-cloud/30" : "bg-cloud/30"}>
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
