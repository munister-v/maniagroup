/**
 * Canonical homepage sections — client-safe (no fs imports), so both the admin
 * client UI and the server page can import it. `id` must match the section map
 * in src/app/page.tsx.
 */
export const HOME_SECTIONS: { id: string; label: string }[] = [
  { id: "hero",        label: "Hero (перший екран)" },
  { id: "marquee",     label: "Стрічка брендів" },
  { id: "categories",  label: "Категорії (3 плитки)" },
  { id: "newArrivals", label: "Новинки" },
  { id: "editorial",   label: "Editorial-блок" },
  { id: "services",    label: "Переваги (4 картки)" },
  { id: "newsletter",  label: "Підписка" },
];
