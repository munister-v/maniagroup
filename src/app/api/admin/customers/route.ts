import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listCustomers, type CustomerSegment } from "@/lib/customers";

const SEGMENTS = new Set(["vip", "regular", "dormant", "new", "lead"]);

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const qParam = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const sortBy = searchParams.get("sortBy") ?? undefined;
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const segmentParam = searchParams.get("segment") ?? "";
  const segment = SEGMENTS.has(segmentParam) ? (segmentParam as CustomerSegment) : undefined;
  const { customers, total } = await listCustomers({ q: qParam || undefined, page, sortBy, sortDir, segment });
  return NextResponse.json({ customers, total });
}
