import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { listSubscribers, allSubscribers } from "@/lib/subscribers";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);

  if (searchParams.get("format") === "csv") {
    const subs = await allSubscribers();
    const header = ["Email", "Джерело", "Дата"];
    const rows = subs.map((s) => [s.email, s.source, new Date(s.created_at).toLocaleString("uk-UA")]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const qParam = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const { subscribers, total } = await listSubscribers({ q: qParam || undefined, page });
  return NextResponse.json({ subscribers, total });
}
