import { isAdmin } from "@/lib/adminAuth";
import { importCatalog } from "@/lib/catalogImport";
import { getMeta, setMeta } from "@/lib/db";

// Import + Store API photo fetch takes ~1 min — allow up to 5.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Очікується multipart/form-data" }), { status: 400 });
  }

  const mg = form.get("mg");
  const wp = form.get("wp");
  if (!(mg instanceof File) || !(wp instanceof File)) {
    return new Response(JSON.stringify({ error: "Потрібні обидва файли: MG та WP" }), { status: 400 });
  }

  // Read buffers before streaming so the stream start() doesn't race with formData parsing.
  const [mgBuffer, wpBuffer] = await Promise.all([
    mg.arrayBuffer().then((b) => Buffer.from(b)),
    wp.arrayBuffer().then((b) => Buffer.from(b)),
  ]);
  const mgName = mg.name;
  const wpName = wp.name;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        const result = await importCatalog({
          mgBuffer,
          wpBuffer,
          onProgress: (msg) => send({ type: "progress", message: msg }),
        });

        // Persist history (best-effort).
        try {
          const prev = JSON.parse((await getMeta("import_history")) || "[]") as unknown[];
          const entry = {
            at: new Date().toISOString(),
            mg: mgName, wp: wpName,
            inStock: result.inStock, archived: result.archived,
            total: result.total, withImages: result.withImages, categories: result.categories,
          };
          await setMeta("import_history", JSON.stringify([entry, ...prev].slice(0, 10)));
        } catch {}

        send({ type: "done", ...result });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "Помилка імпорту" });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
