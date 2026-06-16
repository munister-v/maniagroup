import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { parseMg, parseWp, computeDiff } from "@/lib/xlsSync";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очікується multipart/form-data" }, { status: 400 });
  }

  const mgFile = form.get("mg");
  const wpFile = form.get("wp");
  if (!(mgFile instanceof File) || !(wpFile instanceof File)) {
    return NextResponse.json({ error: "Потрібні обидва файли: MG та WP" }, { status: 400 });
  }

  try {
    const [mgBuf, wpBuf] = await Promise.all([
      mgFile.arrayBuffer().then((b) => Buffer.from(b)),
      wpFile.arrayBuffer().then((b) => Buffer.from(b)),
    ]);

    const mg = parseMg(mgBuf);
    const wp = parseWp(wpBuf);
    const { diff, counts } = await computeDiff(mg, wp);

    // Return changed items + a sample of unchanged (to keep payload light).
    const changed   = diff.filter((d) => d.change !== "unchanged");
    const unchanged = diff.filter((d) => d.change === "unchanged").slice(0, 50);
    const items = [...changed, ...unchanged];

    return NextResponse.json({ counts, items, mgCount: mg.size, wpCount: wp.size });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка аналізу";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
