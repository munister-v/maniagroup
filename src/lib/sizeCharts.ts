import { q } from "./pg";

export type SizeRow = { label: string; eu?: string; us?: string; uk?: string; cm?: string };
export type SizeChart = {
  id: string;
  brand: string;
  name: string;
  gender: string;
  chart: SizeRow[];
  created_at: string;
};
export type SizeChartInput = { brand: string; name: string; gender: string; chart: SizeRow[] };

export async function listSizeCharts(): Promise<SizeChart[]> {
  return q<SizeChart>(`SELECT * FROM size_charts ORDER BY created_at DESC`);
}

export async function createSizeChart(input: SizeChartInput): Promise<{ id: string }> {
  const rows = await q<{ id: string }>(
    `INSERT INTO size_charts (brand, name, gender, chart) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.brand, input.name, input.gender, JSON.stringify(input.chart)],
  );
  return { id: rows[0].id };
}

export async function updateSizeChart(id: number, input: SizeChartInput): Promise<void> {
  await q(
    `UPDATE size_charts SET brand = $2, name = $3, gender = $4, chart = $5 WHERE id = $1`,
    [id, input.brand, input.name, input.gender, JSON.stringify(input.chart)],
  );
}

export async function deleteSizeChart(id: number): Promise<void> {
  await q(`DELETE FROM size_charts WHERE id = $1`, [id]);
}
