import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listErpProducts, erpOverview } from "@/lib/erp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const stock = sp.get("stock");
  const [list, overview] = await Promise.all([
    listErpProducts({
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? "1"),
      stock: stock === "in" || stock === "out" ? stock : "",
    }),
    erpOverview(),
  ]);
  return NextResponse.json({ ...list, overview });
}
