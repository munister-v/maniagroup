/**
 * Спільні налаштування cookie.
 *
 * `secure` вмикається лише в production: локальний dev ходить по http і з
 * secure-кукою просто не залогінишся. На проді обидва домени — HTTPS-only,
 * тож прапорець нічого не ламає, але не дає кукі піти у відкритому вигляді
 * першим запитом до того, як спрацює редірект на HTTPS.
 */
export const SECURE_COOKIE = process.env.NODE_ENV === "production";

export const baseCookie = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  secure: SECURE_COOKIE,
};
