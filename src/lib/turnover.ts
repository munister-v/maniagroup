/**
 * C3 — Оборотність складу та мертвий запас.
 *
 * Дві сторони одного питання «чи працюють гроші, що лежать на складі»:
 *
 *   оборотність = COGS за період / середня вартість запасу (у закупці)
 *   мертвий запас = позиції з залишком, які не продавалися N днів
 *
 * Продажі беремо з `stock_movements` (type='sale', delta від'ємна) — це єдине
 * місце, де рух складу вже нормалізований по розмірах: замовлення можуть бути
 * скасовані/повернені, а леджер тримає і 'return' зі знаком плюс, тож нетто
 * по обох типах дає реально відвантажені одиниці.
 *
 * ⚠️ Середній запас рахуємо як (поточний + поточний − нетто-рух за період)/2:
 * знімків історії залишку немає, тому початковий відновлюємо з леджера назад.
 *
 * ⚠️ Поштучні залишки (`stock_qty`) у більшості імпортованих товарів = 0 —
 * XLS дає лише прапорець «в наявності». Тому одиниці рахуємо так само, як звіт
 * «Оцінка складу»: товар в наявності без кількості = 1 одиниця. `estimated` у
 * відповіді каже, яка частка запасу порахована цим припущенням.
 *
 * Server-only.
 */

import { q } from "./pg";
import { costSql, getFinanceSettings } from "./finance";
import { ukrainianize } from "./uk";

export type TurnoverSummary = {
  days: number;
  /** Собівартість проданого за період. */
  cogs: number;
  /** Вартість запасу в закупці: зараз / на початок періоду / середня. */
  stockValueNow: number;
  stockValueStart: number;
  stockValueAvg: number;
  /** Скільки разів запас обернувся за період. */
  turns: number;
  /** Скільки днів лежить середня одиниця (days / turns). */
  daysOnHand: number | null;
  unitsSold: number;
  unitsOnHand: number;
  /** Скільки товарів у наявності мають реальну поштучну кількість (решта = 1). */
  withRealQty: number;
  inStockItems: number;
};

export type TurnoverBrandRow = {
  brand: string;
  unitsSold: number;
  cogs: number;
  stockValue: number;
  unitsOnHand: number;
  turns: number | null;
};

export type DeadStockRow = {
  id: string;
  name: string;
  brand: string;
  category: string;
  sku: string;
  image: string;
  stock: number;
  price: number;
  stockValue: number;
  lastSold: string | null;
  daysIdle: number | null;
};

export type TurnoverReport = {
  summary: TurnoverSummary;
  byBrand: TurnoverBrandRow[];
  deadStock: DeadStockRow[];
  deadStockTotal: { items: number; units: number; value: number };
};

const num = (v: unknown) => Number(v) || 0;

/**
 * Одиниці на складі. Дзеркалить звіт «Оцінка складу»: якщо поштучної кількості
 * немає, але товар у наявності — рахуємо як 1, інакше весь склад був би нулем.
 */
const UNITS = "GREATEST(COALESCE(p.stock_qty,0), CASE WHEN p.is_in_stock THEN 1 ELSE 0 END)";

/**
 * @param days вікно аналізу (30/90/180/365)
 * @param idleDays поріг «мертвого» запасу — стільки днів без продажу
 */
export async function getTurnoverReport(days = 90, idleDays = 90): Promise<TurnoverReport> {
  const settings = await getFinanceSettings();
  const cost = costSql("p", settings, { brandPctCol: "cr.pct" });

  // Поточна вартість запасу в закупці. stock_qty — дзеркало суми варіантів.
  const [stockNow] = await q<{ value: string; units: string; with_qty: string; in_stock: string }>(
    `SELECT COALESCE(SUM(${cost} * ${UNITS}), 0) AS value,
            COALESCE(SUM(${UNITS}), 0)          AS units,
            COUNT(*) FILTER (WHERE COALESCE(p.stock_qty, 0) > 0) AS with_qty,
            COUNT(*) FILTER (WHERE p.is_in_stock)                AS in_stock
       FROM products p
       LEFT JOIN cost_rules cr ON cr.brand = p.brand`,
  );

  // Нетто-рух за період: продажі мінус повернення, у собівартості й одиницях.
  const [sold] = await q<{ units: string; cogs: string; net: string }>(
    `SELECT COALESCE(SUM(CASE WHEN m.type = 'sale' THEN -m.delta ELSE 0 END), 0)  AS units,
            COALESCE(SUM(-m.delta * ${cost}), 0)                                  AS cogs,
            COALESCE(SUM(m.delta), 0)                                             AS net
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN cost_rules cr ON cr.brand = p.brand
      WHERE m.type IN ('sale', 'return')
        AND m.created_at >= now() - ($1 || ' days')::interval`,
    [String(days)],
  );

  const stockValueNow = num(stockNow?.value);
  const unitsOnHand = num(stockNow?.units);
  const cogs = num(sold?.cogs);
  const unitsSold = num(sold?.units);

  // Запас на початок = поточний мінус те, що леджер додав/зняв за період.
  const stockValueStart = Math.max(stockValueNow - num(sold?.net) * avgUnitCost(stockValueNow, unitsOnHand), 0);
  const stockValueAvg = (stockValueNow + stockValueStart) / 2;
  const turns = stockValueAvg > 0 ? cogs / stockValueAvg : 0;

  const byBrandRows = await q<{
    brand: string; units_sold: string; cogs: string; stock_value: string; units_on_hand: string;
  }>(
    `WITH sales AS (
        SELECT p.brand,
               SUM(CASE WHEN m.type = 'sale' THEN -m.delta ELSE 0 END) AS units_sold,
               SUM(-m.delta * ${cost})                                  AS cogs
          FROM stock_movements m
          JOIN products p ON p.id = m.product_id
          LEFT JOIN cost_rules cr ON cr.brand = p.brand
         WHERE m.type IN ('sale', 'return')
           AND m.created_at >= now() - ($1 || ' days')::interval
         GROUP BY p.brand
     ), stock AS (
        SELECT p.brand,
               SUM(${cost} * ${UNITS}) AS stock_value,
               SUM(${UNITS})           AS units_on_hand
          FROM products p
          LEFT JOIN cost_rules cr ON cr.brand = p.brand
         GROUP BY p.brand
     )
     SELECT COALESCE(s.brand, st.brand)          AS brand,
            COALESCE(s.units_sold, 0)            AS units_sold,
            COALESCE(s.cogs, 0)                  AS cogs,
            COALESCE(st.stock_value, 0)          AS stock_value,
            COALESCE(st.units_on_hand, 0)        AS units_on_hand
       FROM sales s
       FULL OUTER JOIN stock st ON st.brand = s.brand
      WHERE COALESCE(s.units_sold, 0) > 0 OR COALESCE(st.units_on_hand, 0) > 0
      ORDER BY COALESCE(s.cogs, 0) DESC, COALESCE(st.stock_value, 0) DESC
      LIMIT 40`,
    [String(days)],
  );

  const byBrand: TurnoverBrandRow[] = byBrandRows.map((r) => {
    const stockValue = num(r.stock_value);
    const brandCogs = num(r.cogs);
    return {
      brand: r.brand || "—",
      unitsSold: num(r.units_sold),
      cogs: brandCogs,
      stockValue,
      unitsOnHand: num(r.units_on_hand),
      turns: stockValue > 0 ? brandCogs / stockValue : null,
    };
  });

  // Мертвий запас: є залишок, але останній продаж давніший за поріг (або його
  // не було взагалі). LEFT JOIN по останньому руху 'sale'.
  const deadRows = await q<{
    id: string; name: string; brand: string; category: string; sku: string; image_src: string;
    stock: string; price: string; stock_value: string; last_sold: string | null; days_idle: string | null;
  }>(
    `WITH last_sale AS (
        SELECT product_id, MAX(created_at) AS last_sold
          FROM stock_movements
         WHERE type = 'sale'
         GROUP BY product_id
     )
     SELECT p.id::text, p.name, p.brand, p.category, p.sku, p.image_src,
            ${UNITS}                      AS stock,
            COALESCE(p.price, 0)::float                                AS price,
            (${cost} * ${UNITS})          AS stock_value,
            ls.last_sold,
            EXTRACT(DAY FROM now() - ls.last_sold)                     AS days_idle
       FROM products p
       LEFT JOIN cost_rules cr ON cr.brand = p.brand
       LEFT JOIN last_sale ls ON ls.product_id = p.id
      WHERE ${UNITS} > 0
        AND (ls.last_sold IS NULL OR ls.last_sold < now() - ($1 || ' days')::interval)
      ORDER BY (${cost} * ${UNITS}) DESC
      LIMIT 100`,
    [String(idleDays)],
  );

  const deadStock: DeadStockRow[] = deadRows.map((r) => ({
    id: r.id,
    name: ukrainianize(r.name),
    brand: r.brand,
    category: ukrainianize(r.category),
    sku: r.sku,
    image: r.image_src,
    stock: num(r.stock),
    price: num(r.price),
    stockValue: num(r.stock_value),
    lastSold: r.last_sold,
    daysIdle: r.days_idle == null ? null : num(r.days_idle),
  }));

  // Підсумок рахуємо окремим запитом — список обрізаний LIMIT 100, а сума
  // має покривати весь мертвий запас.
  const [deadTotal] = await q<{ items: string; units: string; value: string }>(
    `WITH last_sale AS (
        SELECT product_id, MAX(created_at) AS last_sold
          FROM stock_movements WHERE type = 'sale' GROUP BY product_id
     )
     SELECT COUNT(*)                                                        AS items,
            COALESCE(SUM(${UNITS}), 0)         AS units,
            COALESCE(SUM(${cost} * ${UNITS}), 0) AS value
       FROM products p
       LEFT JOIN cost_rules cr ON cr.brand = p.brand
       LEFT JOIN last_sale ls ON ls.product_id = p.id
      WHERE ${UNITS} > 0
        AND (ls.last_sold IS NULL OR ls.last_sold < now() - ($1 || ' days')::interval)`,
    [String(idleDays)],
  );

  return {
    summary: {
      days,
      cogs,
      stockValueNow,
      stockValueStart,
      stockValueAvg,
      turns,
      daysOnHand: turns > 0 ? days / turns : null,
      unitsSold,
      unitsOnHand,
      withRealQty: num(stockNow?.with_qty),
      inStockItems: num(stockNow?.in_stock),
    },
    byBrand,
    deadStock,
    deadStockTotal: {
      items: num(deadTotal?.items),
      units: num(deadTotal?.units),
      value: num(deadTotal?.value),
    },
  };
}

/** Середня закупівельна вартість одиниці — для реконструкції запасу назад. */
function avgUnitCost(value: number, units: number): number {
  return units > 0 ? value / units : 0;
}
