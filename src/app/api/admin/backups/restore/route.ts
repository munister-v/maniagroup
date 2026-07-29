import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/adminAuth";
import { CONNECTION_STRING } from "@/lib/pg";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const BACKUPS_DIR = "/opt/backups";
const NAME_RE = /^maniagroup-[\w.-]+\.sql\.gz$/;
const CONFIRM_PHRASE = "RESTORE";

function runBackup(): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["/opt/maniagroup/backup-db.sh"], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d.toString(); });
    child.stderr.on("data", (d) => { log += d.toString(); });
    child.on("close", (code) => resolve({ ok: code === 0, log: log.trim() }));
    child.on("error", (err) => resolve({ ok: false, log: err.message }));
  });
}

async function resolveBackupFile(name: string): Promise<string | null> {
  if (!NAME_RE.test(name)) return null;
  const entries = await readdir(BACKUPS_DIR).catch(() => [] as string[]);
  if (!entries.includes(name)) return null;
  const filePath = path.join(BACKUPS_DIR, name);
  const st = await stat(filePath).catch(() => null);
  if (!st?.isFile() || st.size < 100) return null;
  return filePath;
}

function restoreDump(filePath: string): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const reset = spawn("psql", [
      CONNECTION_STRING,
      "-v", "ON_ERROR_STOP=1",
      "-c", "DROP SCHEMA IF EXISTS public CASCADE",
      "-c", "CREATE SCHEMA public",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let resetLog = "";
    reset.stdout.on("data", (d) => { resetLog += d.toString(); });
    reset.stderr.on("data", (d) => { resetLog += d.toString(); });
    reset.on("error", (err) => resolve({ ok: false, log: `schema reset error: ${err.message}` }));
    reset.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, log: resetLog.trim().slice(-8_000) || `schema reset exited ${code}` });
        return;
      }

      const gunzip = spawn("gzip", ["-dc", filePath], { stdio: ["ignore", "pipe", "pipe"] });
      const psql = spawn("psql", [CONNECTION_STRING, "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
      let log = resetLog;

      gunzip.stdout.pipe(psql.stdin);
      gunzip.stderr.on("data", (d) => { log += d.toString(); });
      psql.stdout.on("data", (d) => { log += d.toString(); });
      psql.stderr.on("data", (d) => { log += d.toString(); });

      gunzip.on("error", (err) => {
        log += `\ngzip error: ${err.message}`;
        psql.kill();
      });
      psql.on("error", (err) => {
        log += `\npsql error: ${err.message}`;
        gunzip.kill();
      });

      let gzipCode: number | null = null;
      let psqlCode: number | null = null;
      const finish = () => {
        if (gzipCode === null || psqlCode === null) return;
        resolve({ ok: gzipCode === 0 && psqlCode === 0, log: log.trim().slice(-8_000) });
      };
      gunzip.on("close", (code) => { gzipCode = code; finish(); });
      psql.on("close", (code) => { psqlCode = code; finish(); });
    });
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const file = typeof body.file === "string" ? body.file : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (confirm !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: `Введіть підтвердження точно: ${CONFIRM_PHRASE}` }, { status: 400 });
  }

  const filePath = await resolveBackupFile(file);
  if (!filePath) return NextResponse.json({ error: "Backup-файл не знайдено або назва некоректна" }, { status: 404 });

  const safety = await runBackup();
  if (!safety.ok) {
    return NextResponse.json({ error: "Не вдалося створити аварійну копію перед відновленням — restore скасовано", log: safety.log }, { status: 500 });
  }

  await logActivity("backup", `⚠ Почато відновлення бази з ${file}; аварійну копію створено перед restore`);
  const restored = await restoreDump(filePath);
  if (!restored.ok) {
    await logActivity("backup", `✗ Restore з ${file} завершився помилкою`);
    return NextResponse.json({ error: "Restore не завершився успішно. Перевірте лог.", log: restored.log }, { status: 500 });
  }

  await logActivity("backup", `✓ Базу відновлено з ${file}`);
  return NextResponse.json({ ok: true, file, log: restored.log });
}
