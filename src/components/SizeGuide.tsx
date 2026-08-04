import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import {
  listPublicSizeCharts,
  SIZE_CHART_TYPES,
  type SizeChart,
  type SizeChartType,
} from "@/lib/sizeCharts";

/**
 * Спільна сторінка розмірних таблиць — і для взуття, і для одягу.
 *
 * Дані беруться з розмірних сіток адмінки (`size_charts`, позначені
 * `public_order`), тому клієнт правит таблиці сам, без деплою. Сторінка нічого
 * не вигадує: якщо сітку не позначили до показу — її тут не буде.
 */

export type SizeGuideStep = { n: string; title: string; text: string };

function usedProps(chart: SizeChart, type: SizeChartType) {
  const all = SIZE_CHART_TYPES.find((t) => t.value === type)?.properties ?? [];
  // Колонка показується, лише якщо хоч в одному рядку вона заповнена —
  // інакше таблиця заростає порожніми рядками «—».
  return all.filter((p) => chart.chart.some((r) => (r[p.key] ?? "").trim() !== ""));
}

function ChartTable({ chart, type }: { chart: SizeChart; type: SizeChartType }) {
  const props = usedProps(chart, type);
  const rows = chart.chart.filter((r) => (r.size ?? "").trim() !== "");
  if (rows.length === 0) return null;

  const th =
    "sticky left-0 z-10 whitespace-nowrap border-r border-line bg-cloud/60 px-5 py-3 text-left text-[11px] uppercase tracking-luxe text-muted";

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
                <th scope="row" className={th}>{chart.size_label?.trim() || "Розмір"}</th>
                {rows.map((r, i) => (
                  <td key={i} className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-ink">
                    {r.size}
                  </td>
                ))}
              </tr>
              {props.map((p) => (
                <tr key={p.key} className="border-b border-line last:border-0">
                  <th scope="row" className={th}>{p.label}</th>
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

export async function SizeGuide({
  type,
  title,
  intro,
  stepsTitle,
  steps,
  otherHref,
  otherLabel,
}: {
  type: SizeChartType;
  title: string;
  intro: string;
  stepsTitle: string;
  steps: SizeGuideStep[];
  otherHref: string;
  otherLabel: string;
}) {
  const charts = await listPublicSizeCharts(type).catch(() => []);

  return (
    <div>
      <div className="border-b border-line bg-cloud/40">
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">
            <Link href="/" className="link-underline">Головна</Link> / {title}
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink md:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{intro}</p>
          <Link href={otherHref} className="link-underline mt-5 inline-block text-[12px] uppercase tracking-luxe text-ink">
            {otherLabel}
          </Link>
        </div>
      </div>

      {charts.length > 0 && (
        <section className="wrap space-y-8 py-14 md:py-20">
          {charts.map((c) => (
            <ChartTable key={c.id} chart={c} type={type} />
          ))}
        </section>
      )}

      <section className={charts.length > 0 ? "border-t border-line bg-cloud/30" : "bg-cloud/30"}>
        <div className="wrap py-14 md:py-20">
          <p className="text-[11px] uppercase tracking-luxe text-muted">Як виміряти</p>
          <h2 className="mt-3 font-display text-3xl text-ink md:text-4xl">{stepsTitle}</h2>

          <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
            {steps.map((s) => (
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
            Розміри навіть в одного бренду відрізняються залежно від моделі та крою.
            Якщо сумніваєтесь — напишіть нам, підкажемо по конкретній речі.{" "}
            <Link href="/contacts" className="link-underline text-ink">Контакти</Link>
            {" · "}
            <Link href="/returns" className="link-underline text-ink">Умови обміну</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
