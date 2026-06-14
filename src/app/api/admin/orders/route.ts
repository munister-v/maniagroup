import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { wcAdminFetch, hasWcCredentials } from "@/lib/wcAdmin";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  if (!hasWcCredentials()) {
    return NextResponse.json({ error: "WC_CREDS_MISSING" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") ?? "1";
  const status = searchParams.get("status") ?? "";
  const perPage = searchParams.get("per_page") ?? "20";

  let path = `/orders?per_page=${perPage}&page=${page}&orderby=date&order=desc`;
  if (status) path += `&status=${status}`;

  try {
    const orders = await wcAdminFetch(path);
    return NextResponse.json(orders);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
