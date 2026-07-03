import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { updatePhotoSource, deletePhotoSource } from "@/lib/photoSources";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; base_url?: string; enabled?: boolean };
  await updatePhotoSource(Number(id), body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deletePhotoSource(Number(id));
  return NextResponse.json({ ok: true });
}
