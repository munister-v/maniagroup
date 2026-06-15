import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listCustomers } from "@/lib/customers";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const qParam = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const { customers, total } = await listCustomers({ q: qParam || undefined, page });
  return NextResponse.json({ customers, total });
}
