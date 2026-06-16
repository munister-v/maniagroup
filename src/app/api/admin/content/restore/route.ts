import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { restoreVersionToDraft } from "@/lib/siteContent";

/** Load a version snapshot into the working draft (then preview / publish it). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = (await req.json()) as { id: number };
  const content = await restoreVersionToDraft(Number(id));
  if (!content) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, content });
}
