import { NextResponse } from "next/server";
import { addSubscriber, isValidEmail } from "@/lib/subscribers";

export async function POST(req: Request) {
  try {
    const { email, source } = await req.json();
    if (typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "Введіть коректний email" }, { status: 400 });
    }
    const result = await addSubscriber(email, typeof source === "string" ? source.slice(0, 64) : "");
    return NextResponse.json({ ok: true, status: result });
  } catch (e) {
    console.error("[subscribe]", e);
    return NextResponse.json({ error: "Помилка сервера" }, { status: 500 });
  }
}
