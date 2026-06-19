import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";

export const dynamic = "force-dynamic";

const DEFAULT_TEMPLATES = [
  { slug: "order_confirm", name: "Підтвердження замовлення", subject: "Ваше замовлення №{{order_number}} прийнято", body: "Вітаємо, {{customer_name}}!\n\nВаше замовлення №{{order_number}} успішно прийнято.\nСума: {{total}} ₴\n\nМи зв'яжемось з вами для підтвердження.\n\nДякуємо за покупку!\nMania Group" },
  { slug: "order_shipped", name: "Замовлення відправлено", subject: "Ваше замовлення №{{order_number}} відправлено", body: "Вітаємо, {{customer_name}}!\n\nВаше замовлення №{{order_number}} відправлено Новою Поштою.\nНомер ТТН: {{ttn}}\n\nСтатус можна відстежити на novaposhta.ua\n\nDякуємо!\nMania Group" },
  { slug: "return_confirm", name: "Підтвердження повернення", subject: "Ваше повернення №{{return_id}} прийнято", body: "Вітаємо, {{customer_name}}!\n\nМи прийняли ваше звернення щодо повернення товару.\nНаш менеджер зв'яжеться з вами протягом 1-2 робочих днів.\n\nMania Group" },
];

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  let templates = await q(`SELECT * FROM email_templates ORDER BY name`);
  // Seed defaults if empty
  if (!templates.length) {
    for (const t of DEFAULT_TEMPLATES) {
      await q(
        `INSERT INTO email_templates (name, slug, subject, body) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
        [t.name, t.slug, t.subject, t.body]
      );
    }
    templates = await q(`SELECT * FROM email_templates ORDER BY name`);
  }
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { name, slug, subject, body } = await req.json();
  const [row] = await q(
    `INSERT INTO email_templates (name, slug, subject, body) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name ?? "", slug ?? "", subject ?? "", body ?? ""]
  );
  return NextResponse.json({ ok: true, template: row });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id, name, subject, body } = await req.json();
  await q(
    `UPDATE email_templates SET name=$2, subject=$3, body=$4, updated_at=now() WHERE id=$1`,
    [id, name ?? "", subject ?? "", body ?? ""]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await req.json();
  await q(`DELETE FROM email_templates WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
