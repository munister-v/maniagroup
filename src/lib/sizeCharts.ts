import { q } from "./pg";

/**
 * Size charts (Intertop 2.10 guide "Розмірні сітки") — typed charts, each
 * type exposing its own fixed property set (SIZE_CHART_TYPES below, taken
 * straight from the guide's "Доступні властивості" table). Bound to a
 * product via an explicit `code` (products.size_chart_code), not the old
 * brand+gender best-match heuristic (still used as a fallback for rows that
 * predate this, or were never explicitly bound — see /api/size-chart).
 *
 * Unlike Intertop's own CSV-round-trip-only editing, rows here stay
 * inline-editable — there's no real reason to force a file download/upload
 * cycle just because their system happens to require it.
 */

export type SizeChartType = "clothing" | "shoes" | "accessories" | "jewelry" | "home";

export const SIZE_CHART_TYPES: { value: SizeChartType; label: string; properties: { key: string; label: string }[] }[] = [
  {
    value: "clothing", label: "Одяг",
    properties: [
      { key: "height", label: "Зріст, см" },
      { key: "hips", label: "Обхват стегон, см" },
      { key: "inseam", label: "Внутрішній шов, см" },
      { key: "length", label: "Довжина виробу, см" },
      { key: "head", label: "Обхват голови, см" },
      { key: "eur", label: "Розмір EUR" },
      { key: "intl", label: "Міжнародний розмір" },
      { key: "bust", label: "Обхват грудей, см" },
      { key: "waist", label: "Обхват талії, см" },
    ],
  },
  {
    value: "shoes", label: "Взуття",
    properties: [
      { key: "foot_length", label: "Стопа, см" },
      { key: "insole_length", label: "Довжина устілки, см" },
    ],
  },
  {
    value: "accessories", label: "Аксесуари",
    properties: [
      { key: "height", label: "Зріст, см" },
      { key: "hips", label: "Обхват стегон, см" },
      { key: "length", label: "Довжина виробу, см" },
      { key: "head", label: "Обхват голови, см" },
      { key: "eur", label: "Розмір EUR" },
      { key: "intl", label: "Міжнародний розмір" },
      { key: "waist", label: "Обхват талії, см" },
    ],
  },
  {
    value: "jewelry", label: "Ювелірні вироби",
    properties: [
      { key: "finger", label: "Окружність пальця, мм" },
      { key: "diameter", label: "Діаметр виробу, мм" },
    ],
  },
  {
    value: "home", label: "Товари для дому",
    properties: [
      { key: "set", label: "Комплект" },
      { key: "kind", label: "Тип" },
    ],
  },
];

/** One row: a size label plus whichever of its type's properties are filled. */
export type SizeRow = { size: string; [propKey: string]: string };
export type SizeChart = {
  id: string;
  code: string;
  type: SizeChartType;
  brand: string;
  name: string;
  gender: string;
  chart: SizeRow[];
  /** Порядок на публічній сторінці /rozmiry-vzuttya. null = не показувати. */
  public_order: number | null;
  public_note: string;
  /** Підпис першого рядка, напр. «Розмір (IT)». Порожньо → «Розмір». */
  size_label: string;
  created_at: string;
  updated_at: string;
};
export type SizeChartInput = {
  code: string; type: SizeChartType; brand: string; name: string; gender: string;
  chart: SizeRow[]; public_order?: number | null; public_note?: string; size_label?: string;
};

const COLS = `id::text, code, type, brand, name, gender, chart,
  public_order, public_note, size_label, created_at::text, updated_at::text`;

export async function listSizeCharts(): Promise<SizeChart[]> {
  return q<SizeChart>(`SELECT ${COLS} FROM size_charts ORDER BY updated_at DESC`);
}

/**
 * Сітки для публічної сторінки розмірів — лише позначені до показу, у заданому
 * адміном порядку. Сторінка нічого не вигадує: що тут пусто, того на сайті нема.
 */
export async function listPublicSizeCharts(type?: SizeChartType): Promise<SizeChart[]> {
  const where = type ? "AND type = $1" : "";
  return q<SizeChart>(
    `SELECT ${COLS} FROM size_charts
      WHERE public_order IS NOT NULL ${where}
      ORDER BY public_order, id`,
    type ? [type] : [],
  );
}

export async function createSizeChart(input: SizeChartInput): Promise<{ id: string }> {
  const rows = await q<{ id: string }>(
    `INSERT INTO size_charts (code, type, brand, name, gender, chart, public_order, public_note, size_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
    [input.code, input.type, input.brand, input.name, input.gender, JSON.stringify(input.chart),
     input.public_order ?? null, input.public_note ?? "", input.size_label ?? ""],
  );
  return { id: rows[0].id };
}

export async function updateSizeChart(id: number, input: SizeChartInput): Promise<void> {
  await q(
    `UPDATE size_charts SET code = $2, type = $3, brand = $4, name = $5, gender = $6, chart = $7,
            public_order = $8, public_note = $9, size_label = $10, updated_at = now() WHERE id = $1`,
    [id, input.code, input.type, input.brand, input.name, input.gender, JSON.stringify(input.chart),
     input.public_order ?? null, input.public_note ?? "", input.size_label ?? ""],
  );
}

export async function deleteSizeChart(id: number): Promise<void> {
  await q(`DELETE FROM size_charts WHERE id = $1`, [id]);
}
