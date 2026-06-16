import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getEditableContent, getPublishedContent, saveDraft, type SiteContent } from "@/lib/siteContent";

/** Editor reads the working draft (or published current if no draft yet).
 *  Pass ?slot=current to get the published version (for "reset draft" UX). */
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { searchParams } = new URL(req.url);
  if (searchParams.get("slot") === "current") {
    return NextResponse.json(await getPublishedContent());
  }
  return NextResponse.json(await getEditableContent());
}

/** Autosave: persist the working draft. Publishing is a separate endpoint. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const content = (await req.json()) as SiteContent;
  await saveDraft(content);
  return NextResponse.json({ ok: true });
}
