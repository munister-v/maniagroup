/**
 * Екран 6 карти Intertop — «Фінанси / Баланс»: реєстр руху грошей по періодах
 * у форматі На початку · Прихід · Видаток · На кінець.
 *
 * Прихід — фактично отримані гроші, тобто оплачені замовлення (`paid_at`), а
 * НЕ оформлені: замовлення на накладений платіж стоїть тижнями і грошима ще не
 * є. Видаток — реєстр витрат (`expenses`).
 *
 * «На початку» першого періоду — накопичене сальдо за весь час до нього, тому
 * ланцюжок сходиться навіть коли дивишся вузьке вікно.
 *
 * Server-only.
 */

import { q, q1 } from "./pg";

export type BalanceRow = {
  period: string;
  opening: number;
  income: number;
  expense: number;
  closing: number;
  orders: number;
};

export type BalanceReport = {
  rows: BalanceRow[];
  totals: { opening: number; income: number; expense: number; closing: number; orders: number };
  /** Оформлено, але ще не оплачено — гроші, яких у балансі свідомо немає. */
  pending: { orders: number; amount: number };
};

const num = (v: unknown) => Number(v) || 0;

const GRAIN = {
  day: "day",
  month: "month",
  year: "year",
} as const;
export type BalanceGrain = keyof typeof GRAIN;

export async function getBalanceReport(opts?: {
  from?: string;
  to?: string;
  grain?: BalanceGrain;
}): Promise<BalanceReport> {
  const grain = GRAIN[opts?.grain ?? "month"] ?? "month";
  const from = opts?.from || "";
  const to = opts?.to || "";

  // Сальдо до початку вікна — стартова точка ланцюжка.
  const openingRow = await q1<{ income: string; expense: string }>(
    `SELECT
       COALESCE((SELECT SUM(o.total) FROM orders o
                  WHERE o.paid_at IS NOT NULL
                    AND ($1 = '' OR o.paid_at < $1::timestamptz)), 0) AS income,
       COALESCE((SELECT SUM(e.amount) FROM expenses e
                  WHERE $1 = '' OR e.spent_on < $1::date), 0)          AS expense`,
    [from ? from + "T00:00:00Z" : ""],
  );
  let running = num(openingRow?.income) - num(openingRow?.expense);

  const periods = await q<{ period: string; income: string; expense: string; orders: string }>(
    `WITH inc AS (
        SELECT date_trunc('${grain}', o.paid_at) AS period,
               SUM(o.total)                      AS income,
               COUNT(*)                          AS orders
          FROM orders o
         WHERE o.paid_at IS NOT NULL
           AND ($1 = '' OR o.paid_at >= $1::timestamptz)
           AND ($2 = '' OR o.paid_at <= $2::timestamptz)
         GROUP BY 1
     ), exp AS (
        SELECT date_trunc('${grain}', e.spent_on::timestamptz) AS period,
               SUM(e.amount)                                    AS expense
          FROM expenses e
         WHERE ($1 = '' OR e.spent_on >= $1::date)
           AND ($2 = '' OR e.spent_on <= $2::date)
         GROUP BY 1
     )
     SELECT to_char(COALESCE(inc.period, exp.period), 'YYYY-MM-DD') AS period,
            COALESCE(inc.income, 0)   AS income,
            COALESCE(exp.expense, 0)  AS expense,
            COALESCE(inc.orders, 0)   AS orders
       FROM inc FULL OUTER JOIN exp ON exp.period = inc.period
      ORDER BY 1`,
    [from ? from + "T00:00:00Z" : "", to ? to + "T23:59:59Z" : ""],
  );

  const rows: BalanceRow[] = periods.map((p) => {
    const income = num(p.income);
    const expense = num(p.expense);
    const opening = running;
    running = opening + income - expense;
    return { period: p.period, opening, income, expense, closing: running, orders: num(p.orders) };
  });

  const pendingRow = await q1<{ orders: string; amount: string }>(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS amount
       FROM orders
      WHERE paid_at IS NULL AND status NOT IN ('cancelled', 'refunded')`,
  );

  return {
    rows,
    totals: {
      opening: rows[0]?.opening ?? running,
      income: rows.reduce((s, r) => s + r.income, 0),
      expense: rows.reduce((s, r) => s + r.expense, 0),
      closing: running,
      orders: rows.reduce((s, r) => s + r.orders, 0),
    },
    pending: { orders: num(pendingRow?.orders), amount: num(pendingRow?.amount) },
  };
}
