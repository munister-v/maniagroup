import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { saveSiteContent, DEFAULT_CONTENT, type SiteContent } from "@/lib/siteContent";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  let backup: { version?: number; siteContent?: unknown };
  try {
    backup = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!backup.siteContent || typeof backup.siteContent !== "object") {
    return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
  }

  const saved = backup.siteContent as Partial<SiteContent> & Record<string, unknown>;
  const merged: SiteContent = {
    ...DEFAULT_CONTENT,
    ...saved,
    hero: { ...DEFAULT_CONTENT.hero, ...(saved.hero ?? {}) },
    services: (saved.services as SiteContent["services"] | undefined) ?? DEFAULT_CONTENT.services,
  };

  await saveSiteContent(merged);
  return NextResponse.json({ ok: true });
}
