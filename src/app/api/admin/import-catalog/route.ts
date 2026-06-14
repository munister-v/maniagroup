import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { importCatalog } from "@/lib/catalogImport";

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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Помилка імпорту" },
      { status: 500 },
    );
  }
}
