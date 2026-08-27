/**
 * One-off (and re-runnable) backfill of the media index.
 *
 * The library predates its own table: ~13.5k product photos were written to
 * /catalog by the WordPress migration and by importers that know nothing about
 * an index. This walks the disk, measures and hashes every file, and fills in
 * the rows. Safe to run repeatedly — it only touches what changed.
 *
 * Hashing reads all 1.4 GB, so it runs in slices with a pause between them:
 * this shares a 1.7 GB box with the shop, and the last process that read the
 * whole photo library at once was the one that got OOM-killed.
 *
 *   NODE_ENV=production npx tsx scripts/backfill-media.ts
 *   NODE_ENV=production npx tsx scripts/backfill-media.ts --no-hash   # metadata only
 */
import { syncMediaIndex } from "../src/lib/mediaIndex";
import { pool } from "../src/lib/pg";

const withHash = !process.argv.includes("--no-hash");
const SLICE = 300;

async function main() {
  console.log(`[media] backfill start (hash: ${withHash ? "yes" : "no"})`);
  let round = 0;
  let addedTotal = 0;
  let updatedTotal = 0;
  let removedTotal = 0;

  for (;;) {
    const s = await syncMediaIndex({ limit: SLICE, withHash });
    addedTotal += s.added;
    updatedTotal += s.updated;
    removedTotal += s.removed;
    round++;
    console.log(
      `[media] round ${round}: +${s.added} нових, ~${s.updated} оновлених, -${s.removed} зниклих (на диску ${s.total})`,
    );
    if (s.added + s.updated === 0) break;
    if (round > 200) { console.warn("[media] зупиняюсь: забагато раундів, схоже на цикл"); break; }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`[media] готово: +${addedTotal} / ~${updatedTotal} / -${removedTotal}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("[media] backfill failed", e);
  await pool.end().catch(() => {});
  process.exit(1);
});
