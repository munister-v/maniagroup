import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { listEnabledPhotoSources } from "@/lib/photoSources";
import { searchAcrossSources, fetchImageBytes } from "@/lib/wpPhotos";
import { optimizeImage } from "@/lib/imageOptimize";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PUB_DIR = path.join(process.cwd(), "public", "catalog");
// Cap per run so one request can't hammer the source site indefinitely or
// blow past the route's time budget — matches the scale of a typical
// "products imported without photos" batch (see Каталог → «На сайті: Без фото»).
const MAX_PRODUCTS = 400;
// The search step dominates total time (~7s/query against the old site's
// slow media search, measured), far more than the photo downloads — a run
// with only 8 matches out of 400 still took ~9min. Searches are cheap
// (no file I/O, no sharp), so it's safe to push this higher than photo
// download concurrency.
const CONCURRENCY = 16;
// The old source site is the real bottleneck (slow shared hosting), not our
// loop structure — pushing this past ~6-8 measured no faster in testing.
const PHOTO_CONCURRENCY = 8;

type Target = { id: number; name: string; code: string };

async function loadTargets(): Promise<Target[]> {
  const rows = await q<{ id: string; name: string; sku: string; factory_article: string }>(
    `SELECT id::text, name, sku, factory_article FROM products
     WHERE (images IS NULL OR images::text IN ('[]','null',''))
       AND (sku <> '' OR factory_article <> '')
     ORDER BY id DESC LIMIT $1`,
    [MAX_PRODUCTS],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, code: r.sku || r.factory_article }));
}

/** Runs `fn` over `items` with bounded concurrency, reporting completions as they land. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onDone?: () => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
      onDone?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** NDJSON progress stream — each line is one JSON event, final line is {type:"done",...}. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { mode } = (await req.json().catch(() => ({}))) as { mode?: "preview" | "apply" };

  const sources = await listEnabledPhotoSources();
  if (sources.length === 0) return new Response(JSON.stringify({ error: "Не додано жодного джерела (Налаштування → Фото з WP)" }), { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        const targets = await loadTargets();
        if (targets.length === 0) {
          emit({ type: "done", ok: true, checked: 0, found: [], notFound: [] });
          controller.close();
          return;
        }

        let searchedCount = 0;
        const searched = await mapLimit(
          targets,
          CONCURRENCY,
          async (t) => ({ target: t, hit: await searchAcrossSources(sources, t.code) }),
          () => { searchedCount++; emit({ type: "search-progress", checked: searchedCount, total: targets.length }); },
        );

        const found = searched.filter((s): s is { target: Target; hit: NonNullable<typeof s.hit> } => s.hit !== null);
        const notFound = searched.filter((s) => s.hit === null).map((s) => ({ id: s.target.id, name: s.target.name, code: s.target.code }));

        const sourceName = new Map(sources.map((s) => [s.id, s.name]));

        if (mode !== "apply") {
          emit({
            type: "done", ok: true, checked: targets.length,
            found: found.map((f) => ({
              id: f.target.id, name: f.target.name, code: f.target.code,
              count: f.hit.photos.length, preview: f.hit.photos[0].url,
              source: sourceName.get(f.hit.sourceId) ?? "",
            })),
            notFound,
          });
          controller.close();
          return;
        }

        // ── apply: download + optimize + save each found photo, same pipeline
        // as the local bulk-match upload route (public/catalog/<id>/<n>.<ext>).
        // Concurrency is per-PHOTO, not per-product — grouping by product left
        // most workers idle while one product with many photos finished.
        type Job = { target: Target; index: number; url: string };
        const jobs: Job[] = [];
        for (const { target, hit } of found) {
          hit.photos.forEach((p, i) => jobs.push({ target, index: i, url: p.url }));
        }

        let downloadedCount = 0;
        const jobResults = await mapLimit(
          jobs,
          PHOTO_CONCURRENCY,
          async (job) => {
            const dl = await fetchImageBytes(job.url);
            if (!dl) return null;
            try {
              const opt = await optimizeImage(dl.buf, dl.mimeType);
              const destDir = path.join(PUB_DIR, String(job.target.id));
              await mkdir(destDir, { recursive: true });
              const outName = `${job.index + 1}.${opt.ext}`;
              await writeFile(path.join(destDir, outName), opt.buffer);
              return { id: job.target.id, index: job.index, src: `/catalog/${job.target.id}/${outName}` };
            } catch {
              return null;
            }
          },
          () => { downloadedCount++; emit({ type: "apply-progress", done: downloadedCount, total: jobs.length }); },
        );

        const byTarget = new Map<number, { src: string }[]>();
        for (const r of jobResults) {
          if (!r) continue;
          const list = byTarget.get(r.id) ?? [];
          list[r.index] = { src: r.src };
          byTarget.set(r.id, list);
        }

        let productsUpdated = 0;
        let photosSaved = 0;
        const failed: { id: number; name: string }[] = [];
        for (const { target } of found) {
          const saved = (byTarget.get(target.id) ?? []).filter(Boolean);
          if (saved.length === 0) { failed.push({ id: target.id, name: target.name }); continue; }
          await q(
            `UPDATE products SET images = $2::jsonb, image_src = $3, updated_at = now() WHERE id = $1`,
            [target.id, JSON.stringify(saved), saved[0].src],
          );
          productsUpdated++;
          photosSaved += saved.length;
        }

        await logActivity("photos", `Підтягнуто фото з ${sources.length > 1 ? `${sources.length} джерел` : sources[0].name}: ${productsUpdated} товарів, ${photosSaved} фото`, productsUpdated);
        emit({ type: "done", ok: true, checked: targets.length, productsUpdated, photosSaved, failed, notFound });
        controller.close();
      } catch (e) {
        emit({ type: "done", error: e instanceof Error ? e.message : "Помилка" });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
