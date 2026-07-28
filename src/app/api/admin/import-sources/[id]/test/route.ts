import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { testImportSource } from "@/lib/importSources";

/** Dry-run a recurring feed: download, parse and compare, but never write. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const result = await testImportSource(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
