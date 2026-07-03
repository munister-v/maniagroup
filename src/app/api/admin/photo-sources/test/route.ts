import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { pingWpSource } from "@/lib/wpPhotos";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { base_url } = (await req.json().catch(() => ({}))) as { base_url?: string };
  if (!base_url?.trim()) return NextResponse.json({ ok: false, reachable: false });
  const reachable = await pingWpSource(base_url);
  return NextResponse.json({ ok: true, reachable });
}
