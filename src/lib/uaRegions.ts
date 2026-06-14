// WooCommerce numeric state codes for Ukraine (country UA).
export const UA_REGIONS: { code: string; name: string }[] = [
  { code: "1", name: "Вінницька область" },
  { code: "2", name: "Волинська область" },
  { code: "3", name: "Дніпропетровська область" },
  { code: "4", name: "Донецька область" },
  { code: "5", name: "Житомирська область" },
  { code: "6", name: "Закарпатська область" },
  { code: "7", name: "Запорізька область" },
  { code: "8", name: "Івано-Франківська область" },
  { code: "9", name: "Київська область" },
  { code: "10", name: "Кіровоградська область" },
  { code: "11", name: "Луганська область" },
  { code: "12", name: "Львівська область" },
  { code: "13", name: "Миколаївська область" },
  { code: "14", name: "Одеська область" },
  { code: "15", name: "Полтавська область" },
  { code: "16", name: "Рівненська область" },
  { code: "17", name: "Сумська область" },
  { code: "18", name: "Тернопільська область" },
  { code: "19", name: "Харківська область" },
  { code: "20", name: "Херсонська область" },
  { code: "21", name: "Хмельницька область" },
  { code: "22", name: "Черкаська область" },
  { code: "23", name: "Чернівецька область" },
  { code: "24", name: "Чернігівська область" },
  { code: "30", name: "Київ" },
];

/**
 * Map a Nova Poshta area name (e.g. "Львівська", "Київ") to a WooCommerce
 * numeric oblast code. Falls back to Kyiv city (30) if no match is found.
 */
export function wcStateForArea(area: string): string {
  const a = area.trim().toLowerCase();
  if (!a) return "30";
  // exact city/region name first (handles "Київ" → 30, not "Київська область")
  const exact = UA_REGIONS.find((r) => r.name.toLowerCase() === a);
  if (exact) return exact.code;
  // otherwise "<Area>" → "<Area> область"
  const oblast = UA_REGIONS.find((r) => r.name.toLowerCase() === `${a} область`);
  return oblast?.code ?? "30";
}
