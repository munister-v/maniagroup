/**
 * Канонічна адреса магазину.
 *
 * Один і той самий процес (pm2 maniagroup, :3010) обслуговує два домени:
 * shop.maniagroup.com.ua — бойовий, і maniagroup.munister.com.ua — технічне
 * дзеркало. Canonical/OG/sitemap завжди мають вказувати на бойовий, інакше
 * Google бачить два однакові магазини.
 *
 * Перевизначається через NEXT_PUBLIC_SITE_URL у .env.local.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://shop.maniagroup.com.ua"
).replace(/\/+$/, "");

/** Домени, яким дозволено індексуватися (решта віддає noindex у robots.txt). */
export const CANONICAL_HOST = new URL(SITE_URL).host;

/** Індексація вмикається явно: SITE_INDEXABLE=1 у середовищі. */
export const SITE_INDEXABLE = process.env.SITE_INDEXABLE === "1";
