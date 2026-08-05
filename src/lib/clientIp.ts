/**
 * IP клієнта за nginx — джерело правди для лічильників невдалих входів.
 *
 * Тут навмисно НЕ береться перший елемент x-forwarded-for. nginx додає свій
 * запис у кінець списку ($proxy_add_x_forwarded_for), тому початок списку —
 * це те, що прислав сам клієнт, і воно повністю під його контролем. Хто
 * підбирає пароль, міг слати новий фейковий XFF на кожен запит і локаут по IP
 * не спрацьовував би жодного разу.
 *
 * x-real-ip nginx виставляє з $remote_addr і завжди перезаписує, тож підробити
 * його з боку клієнта неможливо — беремо його першим. Останній елемент XFF —
 * запасний варіант із тією ж властивістю (його дописав саме наш nginx).
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
