import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activity";
import { createFolder, listFolders, moveMedia, validFolder } from "@/lib/mediaMove";

/** GET — the folder tree with counts. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ folders: await listFolders() });
}

/**
 * POST — create a folder, or move files into one.
 *
 * Moving is the operation that can break the storefront, so it is deliberately
 * not a drag-and-drop side effect anywhere: it is an explicit action with an
 * explicit target, and it reports how many references it rewrote so the number
 * can be sanity-checked against what was selected.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json().catch(() => ({})) as {
    action?: string; source?: "uploads" | "catalog"; folder?: string; paths?: string[];
  };

  const folder = (body.folder ?? "").trim().replace(/^\/+|\/+$/g, "");

  if (body.action === "create") {
    const source = body.source === "catalog" ? "catalog" : "uploads";
    if (!validFolder(folder) || !folder) {
      return NextResponse.json({ error: "Дозволені літери, цифри, крапка, дефіс і підкреслення" }, { status: 400 });
    }
    try {
      await createFolder(source, folder);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося створити теку" }, { status: 400 });
    }
    logActivity("save", `Медіатека: створено теку /${source}/${folder}`);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "move") {
    const paths = (body.paths ?? []).filter((p) => typeof p === "string");
    if (paths.length === 0) return NextResponse.json({ error: "Не вибрано файлів" }, { status: 400 });
    if (paths.length > 500) return NextResponse.json({ error: "Забагато файлів за раз (>500)" }, { status: 400 });
    try {
      const moved = await moveMedia(paths, folder);
      const refs = moved.reduce((n, m) => n + m.refs, 0);
      logActivity("save", `Медіатека: перенесено ${moved.length} файлів у «${folder || "корінь"}», оновлено посилань: ${refs}`, moved.length);
      return NextResponse.json({ ok: true, moved: moved.length, refs, sample: moved.slice(0, 10) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося перенести" }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
}
