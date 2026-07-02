import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { publishContent, type SiteContent } from "@/lib/siteContent";
import { logActivity } from "@/lib/activity";

/** Promote the submitted content to the live site, snapshotting the old one. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { content, label } = (await req.json()) as { content: SiteContent; label?: string };
  if (!content || typeof content !== "object") {
    return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
  }
  await publishContent(content, label ?? "");
  logActivity("settings", `Опубліковано контент сайту${label ? `: ${label}` : ""}`);
  return NextResponse.json({ ok: true });
}
