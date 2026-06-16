/**
 * Color map: the imported catalog stores colors in Russian (legacy WooCommerce
 * data). This maps each DB color name → a Ukrainian label + a swatch hex so the
 * catalog filter can render localized names and color dots.
 *
 * `hex` is a representative tone for the swatch — `ring` flags near-white tones
 * that need a visible border, and `multi` flags non-solid swatches (print /
 * multicolor) that render a gradient instead of a flat fill.
 */
export type ColorInfo = { uk: string; hex: string; ring?: boolean; multi?: boolean };

export const COLOR_MAP: Record<string, ColorInfo> = {
  "Черный":       { uk: "Чорний",        hex: "#1a1a1a" },
  "Синий":        { uk: "Синій",         hex: "#1e3a8a" },
  "Темно-синий":  { uk: "Темно-синій",   hex: "#172554" },
  "Голубой":      { uk: "Блакитний",     hex: "#60a5fa" },
  "Белый":        { uk: "Білий",         hex: "#ffffff", ring: true },
  "Молочный":     { uk: "Молочний",      hex: "#f7f3e9", ring: true },
  "Кремовый":     { uk: "Кремовий",      hex: "#f3e9d2", ring: true },
  "Серый":        { uk: "Сірий",         hex: "#9ca3af" },
  "Бежевый":      { uk: "Бежевий",       hex: "#d9c4a3" },
  "Песочный":     { uk: "Пісочний",      hex: "#dcc89a" },
  "Коричневый":   { uk: "Коричневий",    hex: "#6b4423" },
  "Тауп":         { uk: "Тауп",          hex: "#8b7d6b" },
  "Красный":      { uk: "Червоний",      hex: "#dc2626" },
  "Бордовый":     { uk: "Бордовий",      hex: "#7f1d1d" },
  "Бургунди":     { uk: "Бургунді",      hex: "#6d1a2e" },
  "Малиновый":    { uk: "Малиновий",     hex: "#be123c" },
  "Розовый":      { uk: "Рожевий",       hex: "#f9a8d4" },
  "Пудровый":     { uk: "Пудровий",      hex: "#f3d3d0" },
  "Фуксия":       { uk: "Фуксія",        hex: "#d6249f" },
  "Коралловый":   { uk: "Кораловий",     hex: "#fb7185" },
  "Персиковый":   { uk: "Персиковий",    hex: "#fdba8c" },
  "Терракотовый": { uk: "Теракотовий",   hex: "#c2552e" },
  "Оранжевый":    { uk: "Помаранчевий",  hex: "#ea580c" },
  "Желтый":       { uk: "Жовтий",        hex: "#facc15" },
  "Горчичный":    { uk: "Гірчичний",     hex: "#caa31a" },
  "Охра":         { uk: "Вохра",         hex: "#b8860b" },
  "Золотой":      { uk: "Золотий",       hex: "#d4af37" },
  "Бронзовый":    { uk: "Бронзовий",     hex: "#a97142" },
  "Серебро":      { uk: "Срібний",       hex: "#c0c0c0" },
  "Зеленый":      { uk: "Зелений",       hex: "#16a34a" },
  "Оливковый":    { uk: "Оливковий",     hex: "#6b7d2e" },
  "Хаки":         { uk: "Хакі",          hex: "#7c7a44" },
  "Мятный":       { uk: "М'ятний",       hex: "#86e3ce" },
  "Бирюзовый":    { uk: "Бірюзовий",     hex: "#14b8a6" },
  "Аквамарин":    { uk: "Аквамарин",     hex: "#3ed9c4" },
  "Фиолетовый":   { uk: "Фіолетовий",    hex: "#7c3aed" },
  "Сиреневый":    { uk: "Бузковий",      hex: "#a78bfa" },
  "Лиловый":      { uk: "Ліловий",       hex: "#b97fd4" },
  "Многоцветный": { uk: "Багатоколірний", hex: "#888", multi: true },
  "Принт":        { uk: "Принт",         hex: "#888", multi: true },
};

/** Ukrainian label for a DB color name (falls back to the raw name). */
export function colorLabel(name: string): string {
  return COLOR_MAP[name]?.uk ?? name;
}

/** Swatch info for a DB color name (falls back to a neutral gray dot). */
export function colorInfo(name: string): ColorInfo {
  return COLOR_MAP[name] ?? { uk: name, hex: "#9ca3af" };
}

/** Inline CSS background for a swatch — solid fill, or a conic mix for print/multi. */
export function swatchBackground(name: string): string {
  const info = colorInfo(name);
  if (info.multi) {
    return "conic-gradient(#dc2626,#facc15,#16a34a,#1e3a8a,#7c3aed,#dc2626)";
  }
  return info.hex;
}
