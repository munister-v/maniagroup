import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Where backup-db.sh (cron, nightly at 03:00, 14-day rotation) writes dumps.
// Hardcoded to match backup-db.sh's own BACKUP_DIR — this is VPS ops state,
// not app config.
const BACKUPS_DIR = "/opt/backups";
const NAME_RE = /^maniagroup-[\w.-]+\.sql\.gz$/;

export type BackupFile = { name: string; size: number; mtime: string };

/** GET — list available backup dumps, newest first. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const entries = await readdir(BACKUPS_DIR);
    const files: BackupFile[] = [];
    for (const name of entries) {
      if (!NAME_RE.test(name)) continue;
      const st = await stat(path.join(BACKUPS_DIR, name));
      files.push({ name, size: st.size, mtime: st.mtime.toISOString() });
    }
    files.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

/** POST — run a backup right now (same script the nightly cron uses). */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return new Promise<NextResponse>((resolve) => {
    const child = spawn("bash", ["/opt/maniagroup/backup-db.sh"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { out += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) logActivity("backup", "Створено резервну копію бази вручну");
      resolve(NextResponse.json(code === 0
        ? { ok: true, log: out.trim() }
        : { error: out.trim() || `backup script exited ${code}` }, { status: code === 0 ? 200 : 500 }));
    });
    child.on("error", (err) => resolve(NextResponse.json({ error: err.message }, { status: 500 })));
  });
}
