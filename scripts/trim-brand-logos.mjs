/**
 * One-off ops script: зрізати порожні поля навколо вже завантажених логотипів.
 *
 * Постачальник віддає логотип у квадратному полотні 1024×1024, і сам напис
 * займає в ньому 6–25% площі. Плитка обмежує ВИСОТУ картинки (~46px), тож
 * ужимався весь квадрат разом із полями, а від напису лишалась смужка в
 * кілька пікселів. Обрізання робить те саме обмеження висоти корисним.
 *
 * Нові логотипи вже приходять обрізаними — trimPadding() у lib/logoDownloader.ts.
 * Цей скрипт потрібен один раз, для тих, що завантажені раніше.
 *
 * Файли перезаписуються на місці, тому оригінали спершу копіюються в
 * <BRANDS_DIR>/.untrimmed — якщо результат десь не сподобається, звідти можна
 * повернути конкретний файл.
 *
 * Usage (на VPS, шлях до медіа відрізняється від локального):
 *   node scripts/trim-brand-logos.mjs /var/lib/maniagroup/media/uploads/brands
 *   node scripts/trim-brand-logos.mjs <dir> --dry-run
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const DIR = process.argv[2] || path.join(process.cwd(), "public", "uploads", "brands");
const DRY = process.argv.includes("--dry-run");
const BACKUP = path.join(DIR, ".untrimmed");

// Нижче цього trim вважається виродженим (однотонна картинка) — не чіпаємо.
const MIN_DIM = 16;
// Менше 3% полів зрізати немає сенсу: виграшу не видно, а файл перезаписується.
const MIN_GAIN = 3;

if (!fs.existsSync(DIR)) {
  console.error(`no such dir: ${DIR}`);
  process.exit(1);
}
if (!DRY) fs.mkdirSync(BACKUP, { recursive: true });

const files = fs.readdirSync(DIR).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
let trimmed = 0, skipped = 0, failed = 0;

for (const f of files) {
  const p = path.join(DIR, f);
  try {
    const meta = await sharp(p).metadata();
    const { data, info } = await sharp(p)
      .trim({ threshold: 12 })
      .png()
      .toBuffer({ resolveWithObject: true });

    const before = (meta.width ?? 0) * (meta.height ?? 0);
    const gain = before ? Math.round(100 - (info.width * info.height * 100) / before) : 0;

    if (info.width < MIN_DIM || info.height < MIN_DIM) {
      console.log(`skip  ${f} — trim degenerate (${info.width}x${info.height})`);
      skipped++; continue;
    }
    if (gain < MIN_GAIN) {
      console.log(`skip  ${f} — already tight (${gain}% padding)`);
      skipped++; continue;
    }

    console.log(`trim  ${f}  ${meta.width}x${meta.height} -> ${info.width}x${info.height}  (-${gain}% padding)`);
    if (!DRY) {
      fs.copyFileSync(p, path.join(BACKUP, f));
      fs.writeFileSync(p, data);
    }
    trimmed++;
  } catch (e) {
    console.log(`FAIL  ${f} — ${String(e).slice(0, 80)}`);
    failed++;
  }
}

console.log(`\n${DRY ? "[dry-run] " : ""}trimmed ${trimmed}, skipped ${skipped}, failed ${failed} of ${files.length}`);
if (!DRY && trimmed) console.log(`originals kept in ${BACKUP}`);
