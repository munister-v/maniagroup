import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/accountAuth";
import { updateAccount, updatePassword, verifyPassword, findAccountByEmail } from "@/lib/accountsDb";

export async function PUT(req: Request) {
  const account = await getSessionAccount();
  if (!account) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });

  const body = await req.json();
  const { first_name, last_name, phone, email, current_password, new_password } = body;

  // Update password if requested
  if (new_password) {
    if (!current_password) return NextResponse.json({ error: "Введіть поточний пароль" }, { status: 400 });
    const full = await findAccountByEmail(account.email);
    if (!full || !verifyPassword(current_password, full.password_hash)) {
      return NextResponse.json({ error: "Поточний пароль невірний" }, { status: 400 });
    }
    if (new_password.length < 6) return NextResponse.json({ error: "Пароль мінімум 6 символів" }, { status: 400 });
    await updatePassword(account.id, new_password);
  }

  await updateAccount(account.id, {
    first_name: first_name ?? account.first_name,
    last_name: last_name ?? account.last_name,
    phone: phone ?? account.phone,
    ...(email && email !== account.email ? { email: email.toLowerCase().trim() } : {}),
  });

  return NextResponse.json({ ok: true });
}
