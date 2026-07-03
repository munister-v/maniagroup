import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listPhotoSources, createPhotoSource, reorderPhotoSources } from "@/lib/photoSources";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ sources: await listPhotoSources() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; base_url?: string };
  if (!body.base_url?.trim()) return NextResponse.json({ error: "Вкажіть адресу сайту" }, { status: 400 });
  try {
    const source = await createPhotoSource({ name: body.name ?? "", base_url: body.base_url });
    return NextResponse.json({ ok: true, source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Некоректна адреса" }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { orderedIds?: number[] };
  if (!Array.isArray(body.orderedIds)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await reorderPhotoSources(body.orderedIds);
  return NextResponse.json({ ok: true });
}
