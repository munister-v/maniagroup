/**
 * RU → UK normalization for product data.
 *
 * The catalog was imported from a supplier feed where item names are a mix of
 * Ukrainian and Russian ("Платье", "Женские джинсы", "Свитер Мужской"). The
 * storefront is Ukrainian-only, so we translate at *display* time — the DB stays
 * untouched (non-destructive, survives re-imports). Only words that actually
 * DIFFER between RU and UK live in the map; identical words (Футболка, Сумка…)
 * are intentionally absent and pass through unchanged.
 */

// ── RU → UK word map (lowercase keys) ───────────────────────────────────────
// Garment types, footwear, accessories and gender qualifiers that differ.
const RU_UK: Record<string, string> = {
  // ── одяг ──
  джинсы: "джинси",
  брюки: "штани",
  платье: "сукня",
  свитер: "светр",
  шорты: "шорти",
  рубашка: "сорочка",
  юбка: "спідниця",
  трусы: "труси",
  свитшот: "світшот",
  худи: "худі",
  туника: "туніка",
  лонгслив: "лонгслів",
  лосины: "легінси",
  пиджак: "піджак",
  джинсовая: "джинсова",
  пуловер: "пуловер",
  бомбер: "бомбер",
  фелпа: "світшот",
  комбинезон: "комбінезон",
  комбидресс: "комбідрес",
  корсет: "корсет",
  бермуды: "бермуди",
  кроп: "кроп",
  пижамные: "піжамні",
  пижамный: "піжамний",
  пижама: "піжама",
  халат: "халат",
  // ── взуття ──
  обувь: "взуття",
  кроссовки: "кросівки",
  ботинки: "черевики",
  босоножки: "босоніжки",
  мокасины: "мокасини",
  сникеры: "снікери",
  туфли: "туфлі",
  шлепанцы: "шльопанці",
  вьетнамки: "в'єтнамки",
  сапоги: "чоботи",
  полусапоги: "напівчоботи",
  сандалии: "сандалі",
  эспадрильи: "еспадрильї",
  ботильоны: "черевички",
  балетки: "балетки",
  кеды: "кеди",
  угги: "угі",
  слипоны: "сліпони",
  лоферы: "лофери",
  мюли: "мюлі",
  // ── аксесуари ──
  ремень: "ремінь",
  кошелек: "гаманець",
  "кошелёк": "гаманець",
  перчатки: "рукавички",
  платок: "хустка",
  носки: "шкарпетки",
  гольфы: "гольфи",
  украшение: "прикраса",
  ключница: "ключниця",
  зонт: "парасоля",
  шляпа: "капелюх",
  наполнитель: "наповнювач",
  // ── пляж ──
  бикини: "бікіні",
  пляжная: "пляжна",
  пляжный: "пляжний",
  пляжные: "пляжні",
  пляжное: "пляжне",
  пляж: "пляж",
  плав: "плав",
  // ── інтер'єр / аромати ──
  аромадиффузор: "аромадифузор",
  ароматические: "ароматичні",
  интерьерные: "інтер'єрні",
  полотенце: "рушник",
  // ── рід (жіночий / чоловічий) ──
  женский: "жіночий",
  женская: "жіноча",
  женские: "жіночі",
  женское: "жіноче",
  мужской: "чоловічий",
  мужская: "чоловіча",
  мужские: "чоловічі",
  мужское: "чоловіче",
  // ── інше ──
  бюстгалтер: "бюстгальтер",
  костюмный: "костюмний",
};

// Reverse map (UK → RU) for bilingual search.
const UK_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_UK).map(([ru, uk]) => [uk, ru]),
);

/** Re-apply the source token's capitalization pattern to the translated word. */
function matchCase(source: string, translated: string): string {
  if (source.length > 1 && source === source.toUpperCase()) return translated.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return translated.charAt(0).toUpperCase() + translated.slice(1);
  return translated;
}

/** Translate a single whitespace token, handling dotted compounds (Пляж.платье). */
function translateToken(token: string): string {
  // Dotted compound: translate each segment, keep the dots (Пляж.платье → Пляж.сукня)
  if (token.includes(".") && !/\d/.test(token)) {
    return token.split(".").map(translateToken).join(".");
  }
  const lower = token.toLowerCase();
  const hit = RU_UK[lower];
  return hit ? matchCase(token, hit) : token;
}

/**
 * Convert a product name/category to Ukrainian, word by word.
 * Brand names (EA7, PINKO) and SKU codes (in parentheses / with digits) carry
 * no dictionary entry, so they pass through verbatim.
 */
export function ukrainianize(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return text.replace(/[^\s]+/g, (tok) => translateToken(tok));
}

/**
 * Expand a search term into RU+UK variants so a Ukrainian query ("сукня") also
 * matches Russian-stored names ("Платье") and vice-versa. Always includes the
 * original term (covers SKU / numbers / brand search untouched).
 */
export function expandSearchTerms(term: string): string[] {
  const out = new Set<string>([term]);
  const lower = term.toLowerCase().trim();
  if (RU_UK[lower]) out.add(RU_UK[lower]);
  if (UK_RU[lower]) out.add(UK_RU[lower]);
  return Array.from(out);
}
