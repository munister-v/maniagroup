import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listVersions, snapshotContent, type SiteContent } from "@/lib/siteContent";

/** List all version snapshots (metadata only). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ versions: await listVersions() });
}

/** Save a named manual snapshot ("копія") of the given content. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { content, label } = (await req.json()) as { content: SiteContent; label?: string };
  if (!content || typeof content !== "object") {
    return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
  }
  await snapshotContent(content, label ?? "");
  return NextResponse.json({ ok: true, versions: await listVersions() });
}
