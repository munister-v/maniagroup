import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getSiteContent } from "@/lib/siteContent";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const content = await getSiteContent();
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    siteContent: content,
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="maniagroup-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
