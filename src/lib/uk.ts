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

// ── Gender agreement ────────────────────────────────────────────────────────
// "Женское платье" → word-by-word gives "Жіноче сукня", but сукня is feminine,
// so the qualifier must agree → "Жіноча сукня". We pick the qualifier form from
// the grammatical gender of the garment noun in the same name.
type Gender = "m" | "f" | "n" | "pl";

const NOUN_GENDER: Record<string, Gender> = {
  // f
  сукня: "f", сорочка: "f", спідниця: "f", куртка: "f", кофта: "f", футболка: "f",
  майка: "f", блуза: "f", туніка: "f", фуфайка: "f", шапка: "f", кепка: "f",
  панама: "f", парка: "f", піжама: "f", сумка: "f", парасоля: "f", хустка: "f",
  прикраса: "f", косметичка: "f", шуба: "f", толстовка: "f",
  // m
  светр: "m", джемпер: "m", світшот: "m", топ: "m", жакет: "m", купальник: "m",
  жилет: "m", костюм: "m", кардиган: "m", сарафан: "m", піджак: "m", пуловер: "m",
  бомбер: "m", плащ: "m", пуховик: "m", гольф: "m", ремінь: "m", гаманець: "m",
  рюкзак: "m", шарф: "m", бюстгальтер: "m", комбінезон: "m", корсет: "m", халат: "m",
  // n
  взуття: "n", пальто: "n", поло: "n", худі: "n", бікіні: "n", боді: "n",
  // pl
  джинси: "pl", штани: "pl", шорти: "pl", труси: "pl", кросівки: "pl", черевики: "pl",
  босоніжки: "pl", мокасини: "pl", снікери: "pl", туфлі: "pl", шкарпетки: "pl",
  чоботи: "pl", легінси: "pl", бермуди: "pl", сандалі: "pl", лосини: "pl",
};

const QUALIFIER_FAMILY: Record<string, "women" | "men"> = {
  // RU + UK forms all collapse to a family; the form is chosen by noun gender.
  женский: "women", женская: "women", женские: "women", женское: "women",
  жіночий: "women", жіноча: "women", жіночі: "women", жіноче: "women",
  мужской: "men", мужская: "men", мужские: "men", мужское: "men",
  чоловічий: "men", чоловіча: "men", чоловічі: "men", чоловіче: "men",
};

const QUALIFIER_FORMS: Record<"women" | "men", Record<Gender, string>> = {
  women: { m: "жіночий", f: "жіноча", n: "жіноче", pl: "жіночі" },
  men: { m: "чоловічий", f: "чоловіча", n: "чоловіче", pl: "чоловічі" },
};

/**
 * Convert a product name/category to Ukrainian, word by word, then make any
 * gender qualifier ("жіночий/чоловічий") agree with the garment noun.
 * Brand names (EA7, PINKO) and SKU codes carry no dictionary entry and pass
 * through verbatim.
 */
/** Decode the HTML entities the supplier feed leaves in names (HARMONT&#038;BLAINE → HARMONT&BLAINE). */
function decodeEntities(text: string): string {
  return text
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&apos;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function ukrainianize(text: string | null | undefined): string {
  if (!text) return text ?? "";
  text = decodeEntities(text);
  // Split keeping whitespace so we can rejoin with original spacing.
  const parts = text.split(/(\s+)/);
  const translated = parts.map((p) => (/^\s+$/.test(p) ? p : translateToken(p)));

  // Find the garment noun's gender (first known noun wins).
  let gender: Gender | null = null;
  for (const tok of translated) {
    const g = NOUN_GENDER[tok.toLowerCase()];
    if (g) { gender = g; break; }
  }
  if (!gender) return translated.join("");

  // Re-inflect qualifiers to agree with that noun.
  return translated
    .map((tok) => {
      const fam = QUALIFIER_FAMILY[tok.toLowerCase()];
      return fam ? matchCase(tok, QUALIFIER_FORMS[fam][gender!]) : tok;
    })
    .join("");
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
