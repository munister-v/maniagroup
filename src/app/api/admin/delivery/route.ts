import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getStoreSettings, saveStoreSettings } from "@/lib/settings";
import { npKeySource, testNpKey } from "@/lib/novaposhta";

export const dynamic = "force-dynamic";

/** Never echo a stored key back to the browser — only whether one exists. */
function mask(key: string): string {
  if (!key) return "";
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = await getStoreSettings();
  return NextResponse.json({
    keySource: await npKeySource(),
    keyMasked: mask(s.novaposhta_api_key),
    sender_city: s.novaposhta_sender_city,
    sender_branch: s.novaposhta_sender_branch,
    sender_phone: s.novaposhta_sender_phone,
    free_ship_threshold: s.free_ship_threshold,
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};

  // An empty key field means «leave what is stored», not «erase it» — the UI
  // never receives the real key back, so a blank submit must not wipe it.
  if (typeof body.api_key === "string" && body.api_key.trim()) {
    patch.novaposhta_api_key = body.api_key.trim();
  }
  if (body.clear_key === true) patch.novaposhta_api_key = "";
  for (const f of ["sender_city", "sender_branch", "sender_phone"] as const) {
    if (typeof body[f] === "string") patch[`novaposhta_${f}`] = body[f];
  }
  if (typeof body.free_ship_threshold === "string") patch.free_ship_threshold = body.free_ship_threshold;

  await saveStoreSettings(patch);
  return NextResponse.json({ ok: true });
}

/** Probe a key (the typed one, or the stored/env one when none is supplied). */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const key = typeof body.api_key === "string" && body.api_key.trim() ? body.api_key.trim() : undefined;
  return NextResponse.json(await testNpKey(key));
}
