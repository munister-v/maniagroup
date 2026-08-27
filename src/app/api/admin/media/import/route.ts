import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { logActivity } from "@/lib/activity";
import * as XLSX from "xlsx";

/**
 * The export, edited and sent back.
 *
 * Two jobs on one sheet, because they are the two things an admin fixes in bulk
 * and neither is bearable one card at a time:
 *   meta   — Alt / Заголовок written back onto the file (SEO, accessibility);
 *   attach — SKU + Шлях, i.e. "this photo belongs to that product", which is
 *            how photos arrive from a photographer: a folder and a list.
 *
 * Always previewed first. A spreadsheet touching 13.7k rows is exactly the kind
 * of input that is wrong in a way nobody notices until the storefront shows the
 * wrong coat, so the default is dry: report what would change, change nothing.
 * Applying requires an explicit apply=1, and the report it returns is the same
 * shape as the preview so the two can be compared.
 */

type Row = Record<string, unknown>;

const COL = {
  // Ordered by how unambiguous the column is. "Шлях" is kept for spreadsheets
  // exported before the link columns split in two. "Мініатюра" is deliberately
  // absent: a thumb path happens to resolve to its original today, and relying
  // on that would make a rename of the thumb layout silently reassign photos.
  path: ["Шлях на сайті", "Посилання", "Шлях", "Path", "URL", "Файл на сервері"],
  sku: ["SKU", "Артикул", "sku"],
  alt: ["Alt", "ALT", "alt"],
  title: ["Заголовок", "Title", "title"],
} as const;

function pick(row: Row, names: readonly string[]): string {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** An absolute link pasted back from a browser is still the same file. */
function normalizePath(raw: string): string {
  let p = raw.trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) {
    try { p = new URL(p).pathname; } catch { return ""; }
  }
  // A server path (/var/lib/maniagroup/media/catalog/…) maps back onto its URL.
  const m = p.match(/\/(catalog|uploads)\/.+$/);
  if (m) p = m[0];
  return /^\/(catalog|uploads)\//.test(p) ? p : "";
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "meta");
  const apply = String(form.get("apply") ?? "") === "1";
  const replace = String(form.get("replace") ?? "") === "1"; // attach: replace the product's photos instead of appending

  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
  if (!["meta", "attach"].includes(mode)) return NextResponse.json({ error: "Невідомий режим" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Файл більше 20 МБ" }, { status: 400 });

  let rows: Row[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Не вдалося прочитати файл — це точно XLSX або CSV?" }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "У файлі немає рядків" }, { status: 400 });
  if (rows.length > 20000) return NextResponse.json({ error: "Забагато рядків (>20000)" }, { status: 400 });

  const problems: string[] = [];
  const note = (msg: string) => { if (problems.length < 50) problems.push(msg); };

  const known = new Set(
    (await q<{ path: string }>("SELECT path FROM media")).map((r) => r.path),
  );

  if (mode === "meta") {
    let changed = 0;
    let unchanged = 0;
    const updates: { path: string; alt: string; title: string }[] = [];

    const current = new Map(
      (await q<{ path: string; alt: string; title: string }>("SELECT path, alt, title FROM media"))
        .map((r) => [r.path, r]),
    );

    rows.forEach((row, i) => {
      const p = normalizePath(pick(row, COL.path));
      if (!p) { note(`Рядок ${i + 2}: не розпізнано шлях`); return; }
      if (!known.has(p)) { note(`Рядок ${i + 2}: у бібліотеці немає ${p}`); return; }
      const alt = pick(row, COL.alt);
      const title = pick(row, COL.title);
      const cur = current.get(p);
      if (cur && cur.alt === alt && cur.title === title) { unchanged++; return; }
      updates.push({ path: p, alt, title });
      changed++;
    });

    if (apply) {
      for (const u of updates) {
        await q("UPDATE media SET alt = $2, title = $3 WHERE path = $1", [u.path, u.alt, u.title]);
      }
      logActivity("import", `Імпорт медіатеки: alt/заголовок оновлено у ${changed} файлів`, changed);
    }

    return NextResponse.json({
      ok: true, applied: apply, mode,
      rows: rows.length, changed, unchanged, problems,
      sample: updates.slice(0, 10),
    });
  }

  // attach — SKU + path
  const skuRows = new Map<string, string[]>();
  rows.forEach((row, i) => {
    const sku = pick(row, COL.sku);
    const p = normalizePath(pick(row, COL.path));
    if (!sku) { note(`Рядок ${i + 2}: порожній SKU`); return; }
    if (!p) { note(`Рядок ${i + 2}: не розпізнано шлях`); return; }
    if (!known.has(p)) { note(`Рядок ${i + 2}: у бібліотеці немає ${p}`); return; }
    const list = skuRows.get(sku) ?? [];
    if (!list.includes(p)) list.push(p);
    skuRows.set(sku, list);
  });

  const skus = [...skuRows.keys()];
  const products = await q<{ id: string; sku: string; images: { src: string }[] | null }>(
    "SELECT id::text, sku, images FROM products WHERE sku = ANY($1::text[])",
    [skus],
  );
  const bySku = new Map(products.map((p) => [p.sku, p]));
  for (const sku of skus) if (!bySku.has(sku)) note(`Немає товару з артикулом ${sku}`);

  const plan: { sku: string; id: string; before: number; after: number; adds: string[] }[] = [];
  for (const [sku, paths] of skuRows) {
    const prod = bySku.get(sku);
    if (!prod) continue;
    const before = Array.isArray(prod.images) ? prod.images.map((i) => i.src) : [];
    // Appending is the safe default: a sheet listing one new angle should not
    // silently drop the four photos the product already had.
    const after = replace ? paths : [...before, ...paths.filter((p) => !before.includes(p))];
    if (after.length === before.length && after.every((v, i) => v === before[i])) continue;
    plan.push({ sku, id: prod.id, before: before.length, after: after.length, adds: after.filter((p) => !before.includes(p)) });
    if (apply) {
      await q(
        `UPDATE products
            SET images = $2::jsonb,
                image_src = COALESCE(NULLIF(image_src, ''), $3)
          WHERE id = $1::bigint`,
        [prod.id, JSON.stringify(after.map((src) => ({ src }))), after[0] ?? ""],
      );
    }
  }

  if (apply) logActivity("import", `Імпорт медіатеки: фото прив'язано до ${plan.length} товарів`, plan.length);

  return NextResponse.json({
    ok: true, applied: apply, mode, replace,
    rows: rows.length,
    products: plan.length,
    photos: plan.reduce((n, p) => n + p.adds.length, 0),
    problems,
    sample: plan.slice(0, 10),
  });
}
