import { q, q1 } from "./pg";

/**
 * Admin-facing product CRUD (Postgres). Manually created products get ids in
 * a high range (≥ 900000000) so they never collide with imported WC ids.
 */

const ADMIN_ID_FLOOR = 900_000_000;

export type AdminProductInput = {
  name: string;
  slug?: string;
  sku?: string;
  brand?: string;
  category?: string;
  category_slug?: string;
  gender?: string;
  regular_price: number;
  sale_price?: number | null;
  is_in_stock?: boolean;
  status?: string;
  image_src?: string;
  images?: { src: string }[];
  sizes?: string[];
  description?: string;
  short_description?: string;
  color?: string;
  country?: string;
  season?: string;
  collection?: string;
  composition?: string;
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-+|-+$/g, "");
}

function sizeAttributes(sizes: string[] | undefined): string {
  if (!sizes || sizes.length === 0) return "[]";
  return JSON.stringify([
    {
      taxonomy: "pa_size",
      name: "Розмір",
      terms: sizes.map((s) => ({ name: s, slug: slugify(s) || s })),
    },
  ]);
}

export async function listAdminProducts(opts: { q?: string; page?: number; perPage?: number; stock?: "in" | "out" } = {}) {
  const perPage = opts.perPage ?? 30;
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const conds: string[] = [];
  const bind: unknown[] = [];
  if (opts.q) {
    bind.push(`%${opts.q}%`);
    conds.push(`(name ILIKE $${bind.length} OR brand ILIKE $${bind.length} OR sku ILIKE $${bind.length})`);
  }
  if (opts.stock === "in") conds.push("is_in_stock = TRUE");
  if (opts.stock === "out") conds.push("is_in_stock = FALSE");
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(
    `SELECT id::text AS id, name, slug, sku, brand, category, category_slug, gender,
            regular_price::float AS regular_price, sale_price::float AS sale_price,
            price::float AS price, is_in_stock, status, image_src
     FROM products ${where} ORDER BY id DESC LIMIT ${perPage} OFFSET ${offset}`,
    bind,
  );
  const countRow = await q1<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM products ${where}`, bind);
  return { products: rows, total: Number(countRow?.cnt ?? 0) };
}

export async function getAdminProduct(id: string) {
  return q1(`SELECT *, id::text AS id FROM products WHERE id = $1`, [Number(id)]);
}

export async function createAdminProduct(input: AdminProductInput): Promise<{ id: string }> {
  const idRow = await q1<{ next: string }>(
    `SELECT (GREATEST(COALESCE(MAX(id),0), $1) + 1)::text AS next FROM products`,
    [ADMIN_ID_FLOOR],
  );
  const id = Number(idRow!.next);
  const slug = input.slug || String(id);
  const price = input.sale_price && input.sale_price > 0 && input.sale_price < input.regular_price
    ? input.sale_price
    : input.regular_price;

  await q(
    `INSERT INTO products
      (id, sku, name, slug, brand, category, category_slug, gender,
       price, regular_price, sale_price, is_in_stock, status,
       image_src, images, attributes, description, short_description,
       color, country, season, collection, composition)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      id, input.sku ?? "", input.name, slug, input.brand ?? "Mania Group",
      input.category ?? "Одяг", input.category_slug || slugify(input.category ?? "tovar") || "tovar",
      input.gender ?? "", price, input.regular_price, input.sale_price ?? null,
      input.is_in_stock ?? true, input.status ?? "publish",
      input.image_src ?? input.images?.[0]?.src ?? "",
      JSON.stringify(input.images ?? (input.image_src ? [{ src: input.image_src }] : [])),
      sizeAttributes(input.sizes), input.description ?? "", input.short_description ?? "",
      input.color ?? "", input.country ?? "", input.season ?? "", input.collection ?? "", input.composition ?? "",
    ],
  );
  return { id: String(id) };
}

export async function updateAdminProduct(id: string, input: Partial<AdminProductInput>): Promise<void> {
  const sets: string[] = [];
  const bind: unknown[] = [];
  const add = (col: string, val: unknown) => { bind.push(val); sets.push(`${col} = $${bind.length}`); };

  if (input.name !== undefined) add("name", input.name);
  if (input.slug !== undefined) add("slug", input.slug);
  if (input.sku !== undefined) add("sku", input.sku);
  if (input.brand !== undefined) add("brand", input.brand);
  if (input.category !== undefined) add("category", input.category);
  if (input.category_slug !== undefined) add("category_slug", input.category_slug);
  if (input.gender !== undefined) add("gender", input.gender);
  if (input.regular_price !== undefined) add("regular_price", input.regular_price);
  if (input.sale_price !== undefined) add("sale_price", input.sale_price);
  if (input.is_in_stock !== undefined) add("is_in_stock", input.is_in_stock);
  if (input.status !== undefined) add("status", input.status);
  if (input.image_src !== undefined) add("image_src", input.image_src);
  if (input.images !== undefined) add("images", JSON.stringify(input.images));
  if (input.sizes !== undefined) add("attributes", sizeAttributes(input.sizes));
  if (input.description !== undefined) add("description", input.description);
  if (input.short_description !== undefined) add("short_description", input.short_description);
  if (input.color !== undefined) add("color", input.color);
  if (input.country !== undefined) add("country", input.country);
  if (input.season !== undefined) add("season", input.season);
  if (input.collection !== undefined) add("collection", input.collection);
  if (input.composition !== undefined) add("composition", input.composition);

  add("updated_at", new Date().toISOString());

  if (sets.length === 0) return;
  bind.push(Number(id));
  await q(`UPDATE products SET ${sets.join(", ")} WHERE id = $${bind.length}`, bind);

  // Recompute effective price from the now-current row when prices changed.
  if (input.regular_price !== undefined || input.sale_price !== undefined) {
    await q(
      `UPDATE products SET price = CASE
         WHEN sale_price IS NOT NULL AND sale_price > 0 AND sale_price < regular_price
         THEN sale_price ELSE regular_price END
       WHERE id = $1`,
      [Number(id)],
    );
  }
}

export async function deleteAdminProduct(id: string): Promise<void> {
  await q("DELETE FROM products WHERE id = $1", [Number(id)]);
}

export type BulkAction = "publish" | "unpublish" | "in_stock" | "out_of_stock" | "delete";

export async function bulkProducts(ids: string[], action: BulkAction): Promise<number> {
  const nums = ids.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return 0;
  switch (action) {
    case "publish":
      await q("UPDATE products SET status = 'publish', updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "unpublish":
      await q("UPDATE products SET status = 'draft', updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "in_stock":
      await q("UPDATE products SET is_in_stock = TRUE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "out_of_stock":
      await q("UPDATE products SET is_in_stock = FALSE, updated_at = now() WHERE id = ANY($1)", [nums]); break;
    case "delete":
      await q("DELETE FROM products WHERE id = ANY($1)", [nums]); break;
    default:
      throw new Error("Невідома дія");
  }
  return nums.length;
}
