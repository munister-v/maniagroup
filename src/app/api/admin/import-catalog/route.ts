import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { importCatalog } from "@/lib/catalogImport";
import { getMeta, setMeta } from "@/lib/db";

// Importing + paging the Store API for photos takes ~1 min.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({}, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Очікується multipart/form-data" }, { status: 400 });
  }

  const mg = form.get("mg");
  const wp = form.get("wp");
  if (!(mg instanceof File) || !(wp instanceof File)) {
    return NextResponse.json({ error: "Потрібні обидва файли: MG та WP" }, { status: 400 });
  }

  try {
    const result = await importCatalog({
      mgBuffer: Buffer.from(await mg.arrayBuffer()),
      wpBuffer: Buffer.from(await wp.arrayBuffer()),
    });

    // Append to the import history log (keep the last 10).
    try {
      const prev = JSON.parse((await getMeta("import_history")) || "[]") as unknown[];
      const entry = {
        at: new Date().toISOString(),
        mg: mg.name, wp: wp.name,
        inStock: result.inStock, archived: result.archived,
        total: result.total, withImages: result.withImages, categories: result.categories,
      };
      await setMeta("import_history", JSON.stringify([entry, ...prev].slice(0, 10)));
    } catch { /* history is best-effort */ }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Помилка імпорту" },
      { status: 500 },
    );
  }
}
