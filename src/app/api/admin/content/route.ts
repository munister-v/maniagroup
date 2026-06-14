import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getSiteContent, saveSiteContent, type SiteContent } from "@/lib/siteContent";

export async function GET() {
  return NextResponse.json(await getSiteContent());
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const content = (await req.json()) as SiteContent;
  await saveSiteContent(content);
  return NextResponse.json({ ok: true });
}
