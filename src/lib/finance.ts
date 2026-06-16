/**
 * Finance engine — the cost basis behind every profit/margin number.
 *
 * The MG/WP exports carry NO purchase cost, only retail prices ("Цена базовая"
 * = RRP, "Цена продажи" = our actual selling price). So cost is *resolved* by a
 * layered model, in priority order:
 *
 *   1. products.cost_price   — manual edit or a cost column from a future import
 *   2. cost_rules.pct        — per-brand override
 *   3. global finance setting — markup % (or % of base), from store_settings
 *
 * `pct` and the global percentage are interpreted by the global cost *basis*:
 *   basis "markup" → cost = sellingPrice * 100 / (100 + pct)   (pct = our markup)
 *   basis "base"   → cost = regularPrice * pct / 100           (pct = buy-in % of RRP)
 *
 * costSql() emits a single SQL expression so reports can SUM cost across
 * thousands of rows in one query (joined to cost_rules per brand).
 */

import { q } from "./pg";
import { getSetting, setSetting } from "./settings";

export type CostBasis = "markup" | "base";

export type FinanceSettings = {
  /** Default percentage applied when no per-product/per-brand cost exists. */
  markupPct: number;
  /** How `markupPct` / brand pct is interpreted. */
  basis: CostBasis;
};

const DEFAULTS: FinanceSettings = { markupPct: 100, basis: "markup" };

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const [pct, basis] = await Promise.all([
    getSetting("finance_markup_pct"),
    getSetting("finance_cost_basis"),
  ]);
  return {
    markupPct: pct != null && pct !== "" ? Number(pct) : DEFAULTS.markupPct,
    basis: basis === "base" ? "base" : DEFAULTS.basis,
  };
}

export async function saveFinanceSettings(s: Partial<FinanceSettings>): Promise<void> {
  if (s.markupPct != null && Number.isFinite(s.markupPct)) {
    await setSetting("finance_markup_pct", String(s.markupPct));
  }
  if (s.basis) await setSetting("finance_cost_basis", s.basis);
}

/**
 * Build the per-row cost SQL expression.
 *
 * @param p   alias of the products/order_items row holding price + cost_price
 * @param s   resolved finance settings (markup pct + basis)
 * @param opts.priceCol     column for the selling price            (default `${p}.price`)
 * @param opts.regularCol   column for the RRP / regular price       (default `${p}.regular_price`)
 * @param opts.brandPctCol  optional column with a per-brand pct override (e.g. `cr.pct`)
 *
 * The numbers come from server-side settings we control, so they are inlined
 * safely (no SQL-injection surface — they're coerced through Number()).
 */
export function costSql(
  p: string,
  s: FinanceSettings,
  opts: { priceCol?: string; regularCol?: string; brandPctCol?: string } = {},
): string {
  const priceCol = opts.priceCol ?? `${p}.price`;
  const regularCol = opts.regularCol ?? `${p}.regular_price`;
  const gpct = Number.isFinite(s.markupPct) ? s.markupPct : DEFAULTS.markupPct;
  // pct resolves to per-brand override when present, else the global default.
  const pct = opts.brandPctCol ? `COALESCE(${opts.brandPctCol}, ${gpct})` : `${gpct}`;
  const derived =
    s.basis === "base"
      ? `(${regularCol} * ${pct} / 100.0)`
      : `(${priceCol} * 100.0 / (100.0 + NULLIF(${pct}, -100)))`;
  // Manual / imported absolute cost wins when set (> 0).
  return `COALESCE(NULLIF(${p}.cost_price, 0), ${derived}, 0)`;
}

/**
 * Per-unit COGS expression for an `order_items oi LEFT JOIN products p
 * LEFT JOIN cost_rules cr` query. Priority: the line's snapshotted cost →
 * the product's current cost → the derived cost (from the sold price for the
 * markup basis, or the product RRP for the base basis). Old orders placed
 * before cost-snapshotting fall through to the derived value rather than 0.
 */
export function orderCogsSql(s: FinanceSettings): string {
  const gpct = Number.isFinite(s.markupPct) ? s.markupPct : DEFAULTS.markupPct;
  const pct = `COALESCE(cr.pct, ${gpct})`;
  const derived =
    s.basis === "base"
      ? `(COALESCE(p.regular_price, oi.price) * ${pct} / 100.0)`
      : `(oi.price * 100.0 / (100.0 + NULLIF(${pct}, -100)))`;
  return `COALESCE(NULLIF(oi.cost_price, 0), NULLIF(p.cost_price, 0), ${derived}, 0)`;
}

/** Resolve a single product's cost in JS (mirrors costSql for the editor UI). */
export function resolveCost(
  row: { cost_price?: number | null; price?: number | null; regular_price?: number | null; brand?: string },
  s: FinanceSettings,
  brandPct?: number | null,
): number {
  if (row.cost_price && row.cost_price > 0) return Number(row.cost_price);
  const pct = brandPct != null ? brandPct : s.markupPct;
  if (s.basis === "base") return Math.round((Number(row.regular_price) || 0) * pct) / 100;
  const price = Number(row.price) || 0;
  return pct <= -100 ? 0 : Math.round((price * 100) / (100 + pct));
}

// ── Per-brand cost rules ────────────────────────────────────────────────────

export type CostRule = { brand: string; pct: number; updated_at: string };

export async function getCostRules(): Promise<CostRule[]> {
  return q<CostRule>("SELECT brand, pct::float AS pct, updated_at FROM cost_rules ORDER BY brand");
}

export async function setCostRule(brand: string, pct: number): Promise<void> {
  await q(
    `INSERT INTO cost_rules(brand, pct, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (brand) DO UPDATE SET pct = EXCLUDED.pct, updated_at = now()`,
    [brand, pct],
  );
}

export async function deleteCostRule(brand: string): Promise<void> {
  await q("DELETE FROM cost_rules WHERE brand = $1", [brand]);
}

// ── Expense ledger ──────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: { id: string; label: string }[] = [
  { id: "goods",    label: "Закупівля товару" },
  { id: "ads",      label: "Реклама" },
  { id: "shipping", label: "Доставка / логістика" },
  { id: "salary",   label: "Зарплата" },
  { id: "rent",     label: "Оренда" },
  { id: "fee",      label: "Комісії / еквайринг" },
  { id: "tax",      label: "Податки" },
  { id: "other",    label: "Інше" },
];

export type Expense = {
  id: number; spent_on: string; category: string; amount: number; note: string;
};

export async function listExpenses(from: string, to: string): Promise<Expense[]> {
  return q<Expense>(
    `SELECT id, spent_on::text AS spent_on, category, amount::float AS amount, note
       FROM expenses WHERE spent_on >= $1 AND spent_on <= $2 ORDER BY spent_on DESC, id DESC`,
    [from, to],
  );
}

export async function addExpense(e: Omit<Expense, "id">): Promise<void> {
  await q(
    `INSERT INTO expenses(spent_on, category, amount, note) VALUES ($1,$2,$3,$4)`,
    [e.spent_on, e.category, e.amount, e.note],
  );
}

export async function deleteExpense(id: number): Promise<void> {
  await q("DELETE FROM expenses WHERE id = $1", [id]);
}
