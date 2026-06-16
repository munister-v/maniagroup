import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { parseMg, parseWp, applySync, type ApplyOptions } from "@/lib/xlsSync";
import { getMeta, setMeta } from "@/lib/db";

export const maxDuration = 120;

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

  let opts: ApplyOptions;
  try {
    opts = JSON.parse(String(form.get("apply") ?? "{}"));
  } catch {
    opts = {};
  }
  if (!opts.prices && !opts.stockIn && !opts.stockOut && !opts.newItems) {
    return NextResponse.json({ error: "Не вибрано жодного типу змін для застосування" }, { status: 400 });
  }

  try {
    const start = Date.now();
    const [mgBuf, wpBuf] = await Promise.all([
      mgFile.arrayBuffer().then((b) => Buffer.from(b)),
      wpFile.arrayBuffer().then((b) => Buffer.from(b)),
    ]);

    const mg = parseMg(mgBuf);
    const wp = parseWp(wpBuf);
    const result = await applySync(mg, wp, opts);

    // Refresh meta counters + append to sync log.
    const total = await getMeta("total_products");
    await setMeta("last_sync", new Date().toISOString());
    try {
      const prev = JSON.parse((await getMeta("sync_log")) || "[]") as unknown[];
      const entry = {
        at: new Date().toISOString(),
        type: "incremental",
        applied: opts,
        result,
        ms: Date.now() - start,
      };
      await setMeta("sync_log", JSON.stringify([entry, ...prev].slice(0, 20)));
    } catch {}

    return NextResponse.json({ ok: true, result, ms: Date.now() - start, total });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка синхронізації";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Sync log for the dashboard.
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  try {
    const log = JSON.parse((await getMeta("sync_log")) || "[]");
    return NextResponse.json({ log });
  } catch {
    return NextResponse.json({ log: [] });
  }
}
