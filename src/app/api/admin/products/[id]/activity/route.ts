import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { productActivity } from "@/lib/activity";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await params;
  const activity = await productActivity(id);
  return NextResponse.json({ activity });
}
