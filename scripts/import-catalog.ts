/**
 * CLI catalog import.
 *
 *   npm run import "<MG.xls>" "<WP.xls>"
 *
 * Builds data/catalog.db from the two store exports + Store API photos.
 * Run locally then `scp data/catalog.db` to the VPS, or run on the VPS directly.
 */

import { readFileSync } from "fs";
import { importCatalog } from "../src/lib/catalogImport";

async function main() {
  const [mgPath, wpPath] = process.argv.slice(2);
  if (!mgPath || !wpPath) {
    console.error('Usage: npm run import "<MG.xls>" "<WP.xls>"');
    process.exit(1);
  }

  console.log("MG:", mgPath);
  console.log("WP:", wpPath);

  const result = await importCatalog({
    mgBuffer: readFileSync(mgPath),
    wpBuffer: readFileSync(wpPath),
    onProgress: (m) => console.log(" •", m),
  });

  console.log("\n✓ Готово:");
  console.log(`  в наявності : ${result.inStock}`);
  console.log(`  архів       : ${result.archived}`);
  console.log(`  усього      : ${result.total}`);
  console.log(`  з фото      : ${result.withImages}`);
  console.log(`  категорій   : ${result.categories}`);
  console.log(`  час         : ${(result.ms / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("✗ Помилка імпорту:", e);
  process.exit(1);
});
