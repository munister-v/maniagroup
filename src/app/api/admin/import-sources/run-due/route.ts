import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { runDueUrlSources } from "@/lib/importSources";

/**
 * Guide 2.8: "Оновлення залишків буде відбуватись автоматично раз на три
 * години" — this is what the VPS crontab hits every 3h (see
 * run-import-sources.sh on the server), authenticated by a shared secret
 * since a cron job has no browser session. Also accepts a normal admin
 * session so it's reachable from the UI for testing/manual "run all" too.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  const authorized = (secret && secret === (process.env.ADMIN_SECRET ?? "")) || (await isAdmin());
  if (!authorized) return NextResponse.json({}, { status: 401 });
  const result = await runDueUrlSources();
  return NextResponse.json({ ok: true, ...result });
}
