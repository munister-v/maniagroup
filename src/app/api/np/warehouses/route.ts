import { NextResponse } from "next/server";
import { getWarehouses } from "@/lib/novaposhta";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ref = params.get("ref");
  const q = params.get("q") ?? "";
  if (!ref) return NextResponse.json({ error: "ref required" }, { status: 400 });
  try {
    return NextResponse.json(await getWarehouses(ref, q));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "NP error" },
      { status: 502 },
    );
  }
}
