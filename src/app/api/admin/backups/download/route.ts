import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat, readdir } from "node:fs/promises";
import path from "node:path";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BACKUPS_DIR = "/opt/backups";
const NAME_RE = /^maniagroup-[\w.-]+\.sql\.gz$/;

/** GET ?file=maniagroup-YYYYMMDD-HHMMSS.sql.gz — stream one backup dump. */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = req.nextUrl.searchParams.get("file") ?? "";

  // Strict allow-list: must match the naming pattern AND actually be present
  // in the directory listing — never build a path from raw user input alone.
  if (!NAME_RE.test(file)) return NextResponse.json({ error: "Некоректна назва файлу" }, { status: 400 });
  const entries = await readdir(BACKUPS_DIR).catch(() => [] as string[]);
  if (!entries.includes(file)) return NextResponse.json({ error: "Файл не знайдено" }, { status: 404 });

  const filePath = path.join(BACKUPS_DIR, file);
  const st = await stat(filePath);
  const nodeStream = createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() { nodeStream.destroy(); },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(st.size),
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
}
