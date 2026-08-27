import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { logActivity } from "@/lib/activity";
import { listDuplicates, mergeDuplicates } from "@/lib/mediaDuplicates";
import { thumbUrl } from "@/lib/mediaThumbs";

/** GET ?page=&perPage= — groups of byte-identical files, heaviest waste first. */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const perPage = Math.min(50, Math.max(1, Number(sp.get("perPage")) || 12));

  const { groups, total, wasted } = await listDuplicates({ page, perPage });
  return NextResponse.json({
    groups: groups.map((g) => ({
      ...g,
      files: g.files.map((f) => ({ ...f, thumb: thumbUrl(f.path) })),
    })),
    total, wasted, page, perPage,
  });
}

/**
 * POST { keep, drop[] } — merge a group.
 *
 * Deliberately not "delete duplicates": the storefront must not change. Every
 * reference to the dropped copies is repointed at the kept one and their paths
 * stay as redirects, so what goes away is the wasted bytes, not a photo.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json().catch(() => ({})) as { keep?: string; drop?: string[] };
  const keep = (body.keep ?? "").trim();
  const drop = (body.drop ?? []).filter((p) => typeof p === "string" && p.trim());

  if (!/^\/(uploads|catalog)\//.test(keep)) return NextResponse.json({ error: "Не вказано, який файл лишити" }, { status: 400 });
  if (drop.length === 0) return NextResponse.json({ error: "Не вказано, що об'єднати" }, { status: 400 });
  if (drop.length > 200) return NextResponse.json({ error: "Забагато файлів за раз (>200)" }, { status: 400 });

  try {
    const r = await mergeDuplicates(keep, drop);
    logActivity("delete", `Медіатека: об'єднано ${r.dropped} копій у ${keep} (посилань оновлено ${r.refs})`, r.dropped);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не вдалося об'єднати" }, { status: 400 });
  }
}
