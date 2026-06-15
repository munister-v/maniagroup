import { spawn } from "node:child_process";
import { isAdmin } from "@/lib/adminAuth";
import { CONNECTION_STRING } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Full database dump (catalog, orders, customers, subscribers, settings) via
 * pg_dump, streamed to the browser as a .sql file. Restore on the server with:
 *   psql "$DATABASE_URL" < maniagroup-db-YYYY-MM-DD.sql
 */
export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const child = spawn("pg_dump", ["--no-owner", "--no-privileges", "--clean", "--if-exists", CONNECTION_STRING], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      child.stdout.on("end", () => controller.close());
      child.on("error", (err) => controller.error(err));
      child.on("close", (code) => {
        if (code !== 0) {
          console.error("[backup] pg_dump exited", code, stderr);
          try { controller.error(new Error(stderr || `pg_dump exited ${code}`)); } catch {}
        }
      });
    },
    cancel() {
      child.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="maniagroup-db-${new Date().toISOString().slice(0, 10)}.sql"`,
    },
  });
}
