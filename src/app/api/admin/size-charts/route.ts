import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listSizeCharts, createSizeChart, type SizeChartInput } from "@/lib/sizeCharts";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ charts: await listSizeCharts() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = (await req.json()) as SizeChartInput;
  try {
    const res = await createSizeChart(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
