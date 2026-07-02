import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { isAdmin } from "@/lib/adminAuth";
import { wipeAllProducts } from "@/lib/products";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Must match exactly (case-sensitive) — a throwaway confirm(), not a real
// safeguard, is how catalogs get wiped by a stray click. This one requires
// the admin to actually type the phrase in the UI's confirmation dialog.
const CONFIRM_PHRASE = "ВИДАЛИТИ ВСЕ";

/** Same script the nightly cron and "Резервні копії → Зробити копію" use. */
function runBackup(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["/opt/maniagroup/backup-db.sh"], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/**
 * POST — deletes every product in the catalog. Requires the exact confirm
 * phrase AND a successful fresh backup immediately before — if the backup
 * fails for any reason, the wipe is aborted rather than proceeding without
 * a safety net.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { confirm } = body as { confirm?: string };
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Введіть фразу підтвердження точно: "${CONFIRM_PHRASE}"` }, { status: 400 });
  }

  const backupOk = await runBackup();
  if (!backupOk) {
    return NextResponse.json({ error: "Не вдалося створити резервну копію перед видаленням — операцію скасовано для безпеки" }, { status: 500 });
  }

  const count = await wipeAllProducts();
  await logActivity("delete", `⚠ ПОВНЕ ОЧИЩЕННЯ КАТАЛОГУ — видалено ${count} товарів (резервну копію створено автоматично перед цим)`, count);
  return NextResponse.json({ ok: true, count });
}
