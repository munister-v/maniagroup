import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/adminAuth";
import { discardDraft, PREVIEW_COOKIE } from "@/lib/siteContent";

/** Toggle the admin's preview cookie so site pages render the draft for them. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const { on } = (await req.json()) as { on: boolean };
  const jar = await cookies();
  if (on) {
    jar.set(PREVIEW_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 6 });
  } else {
    jar.delete(PREVIEW_COOKIE);
  }
  return NextResponse.json({ ok: true });
}

/** Discard the working draft entirely (revert editor to published content). */
export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  await discardDraft();
  return NextResponse.json({ ok: true });
}
