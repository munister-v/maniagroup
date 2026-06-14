import { NextResponse } from "next/server";
import { searchCities } from "@/lib/novaposhta";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await searchCities(q));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "NP error" },
      { status: 502 },
    );
  }
}
