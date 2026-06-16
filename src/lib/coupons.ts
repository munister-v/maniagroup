import { q, q1 } from "./pg";

export type Coupon = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_subtotal: number;
  expires_at: string | null;
  usage_limit: number | null;
  used_count: number;
  active: boolean;
  created_at: string;
};

export type CouponInput = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_subtotal?: number;
  expires_at?: string | null;
  usage_limit?: number | null;
  active?: boolean;
};

const SELECT = `id::text AS id, code, type, value::float AS value, min_subtotal::float AS min_subtotal,
  to_char(expires_at, 'YYYY-MM-DD') AS expires_at, usage_limit, used_count, active, created_at`;

export async function listCoupons(): Promise<Coupon[]> {
  return q<Coupon>(`SELECT ${SELECT} FROM coupons ORDER BY created_at DESC`);
}

export async function createCoupon(input: CouponInput): Promise<{ id: string }> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Вкажіть код");
  if (!(input.value > 0)) throw new Error("Знижка має бути більше 0");
  const row = await q1<{ id: string }>(
    `INSERT INTO coupons (code, type, value, min_subtotal, expires_at, usage_limit, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text AS id`,
    [code, input.type, input.value, input.min_subtotal ?? 0, input.expires_at || null,
     input.usage_limit ?? null, input.active ?? true],
  ).catch((e: unknown) => {
    if (e instanceof Error && /unique/i.test(e.message)) throw new Error("Такий код вже існує");
    throw e;
  });
  return { id: row!.id };
}

export async function updateCoupon(id: number, input: Partial<CouponInput>): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const push = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };
  if (input.code !== undefined) push("code", input.code.trim().toUpperCase());
  if (input.type !== undefined) push("type", input.type);
  if (input.value !== undefined) push("value", input.value);
  if (input.min_subtotal !== undefined) push("min_subtotal", input.min_subtotal);
  if (input.expires_at !== undefined) push("expires_at", input.expires_at || null);
  if (input.usage_limit !== undefined) push("usage_limit", input.usage_limit ?? null);
  if (input.active !== undefined) push("active", input.active);
  if (sets.length === 0) return;
  bind.push(id);
  await q(`UPDATE coupons SET ${sets.join(", ")} WHERE id = $${bind.length}`, bind);
}

export async function deleteCoupon(id: number): Promise<void> {
  await q("DELETE FROM coupons WHERE id = $1", [id]);
}

export type CouponValidation =
  | { ok: true; code: string; discount: number; type: "percent" | "fixed"; value: number }
  | { ok: false; error: string };

/** Validate a code against a subtotal and return the computed discount (₴). */
export async function validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
  const c = await q1<Coupon>(`SELECT ${SELECT} FROM coupons WHERE lower(code) = lower($1)`, [code.trim()]);
  if (!c) return { ok: false, error: "Код не знайдено" };
  if (!c.active) return { ok: false, error: "Код неактивний" };
  if (c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10)) return { ok: false, error: "Термін дії коду минув" };
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return { ok: false, error: "Ліміт використань вичерпано" };
  if (subtotal < c.min_subtotal) return { ok: false, error: `Мінімальна сума замовлення — ${c.min_subtotal.toLocaleString("uk-UA")} ₴` };
  const discount = c.type === "percent"
    ? Math.round((subtotal * c.value) / 100)
    : Math.min(c.value, subtotal);
  return { ok: true, code: c.code, discount, type: c.type, value: c.value };
}

export async function incrementCouponUsage(code: string): Promise<void> {
  await q("UPDATE coupons SET used_count = used_count + 1 WHERE lower(code) = lower($1)", [code.trim()]);
}
