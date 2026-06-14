import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/accountsDb";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("mg_session")?.value;
  if (token) await deleteSession(token);
  jar.delete("mg_session");
  return NextResponse.json({ ok: true });
}
