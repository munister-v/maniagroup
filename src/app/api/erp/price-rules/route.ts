import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, pool } from "@/lib/pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const rules = await q(`SELECT * FROM price_rules ORDER BY created_at DESC`);
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const body = await req.json();

  // apply action: run all active rules against products
  if (body.action === "apply") {
    return applyRules();
  }

  const { name, condition_field, condition_value, action, value, active } = body;
  const [row] = await q(
    `INSERT INTO price_rules (name, condition_field, condition_value, action, value, active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name ?? "", condition_field ?? "all", condition_value ?? "", action ?? "set_markup", Number(value) || 0, active !== false]
  );
  return NextResponse.json({ ok: true, rule: row });
}

async function applyRules() {
  const rules = await q(`SELECT * FROM price_rules WHERE active = true ORDER BY created_at`);
  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query("BEGIN");
    for (const rule of rules) {
      let where = "";
      const binds: unknown[] = [];
      if (rule.condition_field === "brand") {
        binds.push(rule.condition_value); where = `WHERE brand = $${binds.length}`;
      } else if (rule.condition_field === "category") {
        binds.push(rule.condition_value); where = `WHERE category = $${binds.length}`;
      } else if (rule.condition_field === "gender") {
        binds.push(rule.condition_value); where = `WHERE gender = $${binds.length}`;
      }

      const pct = Number(rule.value);
      let setPart = "";
      if (rule.action === "set_markup") {
        // regular_price stays, sale_price = regular * (1 - pct/100)
        setPart = `sale_price = ROUND(regular_price * (1 - ${pct}/100.0), 0)`;
      } else if (rule.action === "set_discount") {
        setPart = `sale_price = ROUND(regular_price * (1 - ${pct}/100.0), 0)`;
      } else if (rule.action === "set_sale_pct") {
        setPart = `sale_price = ROUND(regular_price * (1 - ${pct}/100.0), 0)`;
      } else if (rule.action === "set_price") {
        binds.push(pct);
        setPart = `regular_price = $${binds.length}, price = $${binds.length}`;
      }
      if (!setPart) continue;

      const res = await client.query(
        `UPDATE products SET ${setPart}, price = COALESCE(sale_price, regular_price), updated_at = now() ${where}`,
        binds
      );
      updated += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id, name, condition_field, condition_value, action, value, active } = await req.json();
  await q(
    `UPDATE price_rules SET name=$2, condition_field=$3, condition_value=$4, action=$5, value=$6, active=$7 WHERE id=$1`,
    [id, name ?? "", condition_field ?? "all", condition_value ?? "", action ?? "set_markup", Number(value) || 0, active !== false]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });
  const { id } = await req.json();
  await q(`DELETE FROM price_rules WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
