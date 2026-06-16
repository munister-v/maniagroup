import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getEditableContent, saveDraft, type SiteContent } from "@/lib/siteContent";

/** Editor reads the working draft (or published current if no draft yet). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await getEditableContent());
}

/** Autosave: persist the working draft. Publishing is a separate endpoint. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const content = (await req.json()) as SiteContent;
  await saveDraft(content);
  return NextResponse.json({ ok: true });
}
