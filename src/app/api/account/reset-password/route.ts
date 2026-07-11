import { NextResponse } from "next/server";
import { getValidResetToken, consumeResetToken, updatePassword } from "@/lib/accountsDb";

export async function POST(req: Request) {
  const { token, password } = (await req.json()) as { token?: string; password?: string };
  if (!token || !password || password.length < 6) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }
  const valid = await getValidResetToken(token);
  if (!valid) {
    return NextResponse.json({ error: "Посилання недійсне або застаріле" }, { status: 400 });
  }
  await updatePassword(valid.account_id, password);
  await consumeResetToken(token);
  return NextResponse.json({ ok: true });
}
