import { NextResponse } from "next/server";
import { checkPassword, setAdminSession } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const { password } = (await req.json()) as { password: string };
  if (!(await checkPassword(password))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}
