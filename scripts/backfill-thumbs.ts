/**
 * Build grid thumbnails for everything already in the library.
 *
 * Re-runnable and resumable: a thumb newer than its original is skipped, so an
 * interrupted run picks up where it stopped and a second run costs one stat per
 * file. Sliced with a pause for the same reason as the media backfill — this
 * decodes 13.7k images on the box that serves the shop.
 *
 *   NODE_ENV=production npx tsx scripts/backfill-thumbs.ts
 */
import { q, pool } from "../src/lib/pg";
import { ensureThumb } from "../src/lib/mediaThumbs";

const SLICE = 200;

async function main() {
  const rows = await q<{ path: string }>("SELECT path FROM media ORDER BY mtime DESC NULLS LAST");
  console.log(`[thumbs] у бібліотеці ${rows.length} файлів`);

  let built = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += SLICE) {
    const slice = rows.slice(i, i + SLICE);
    for (const r of slice) {
      try {
        if (await ensureThumb(r.path)) built++;
        else skipped++;
      } catch {
        failed++;
      }
    }
    console.log(`[thumbs] ${Math.min(i + SLICE, rows.length)}/${rows.length} — створено ${built}, пропущено ${skipped}, помилок ${failed}`);
    await new Promise((res) => setTimeout(res, 200));
  }

  console.log(`[thumbs] готово: створено ${built}, пропущено ${skipped}, помилок ${failed}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("[thumbs] failed", e);
  await pool.end().catch(() => {});
  process.exit(1);
});
