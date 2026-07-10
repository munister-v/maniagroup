import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { PROPERTY_LIST } from "@/lib/importTemplates";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ properties: PROPERTY_LIST });
}
