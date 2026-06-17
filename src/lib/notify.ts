import { getStoreSettings, getSetting } from "./settings";
import { q } from "./pg";
import type { Order } from "./orders";

/**
 * Telegram notifications for the shop owner. Free, instant, no SMTP needed —
 * configured from the admin Settings tab (bot token + chat id). All sends are
 * best-effort: failures are logged but never block the order flow.
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "Очікує оплати", processing: "В обробці", "on-hold": "На утриманні",
  completed: "Виконано", cancelled: "Скасовано", refunded: "Повернуто",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Low-level send. Returns {ok} or {ok:false,error} — caller decides on failure. */
export async function sendTelegram(text: string, override?: { token?: string; chatId?: string }): Promise<{ ok: boolean; error?: string }> {
  const s = await getStoreSettings();
  const token = override?.token ?? s.telegram_bot_token;
  const chatId = override?.chatId ?? s.telegram_chat_id;
  if (!token || !chatId) return { ok: false, error: "Не вказано токен бота або chat_id" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Помилка з'єднання" };
  }
}

async function enabled(): Promise<boolean> {
  const s = await getStoreSettings();
  return Boolean(s.telegram_enabled && s.telegram_bot_token && s.telegram_chat_id);
}

/** Fire a "new order" message. Non-blocking — swallows errors. */
export async function notifyNewOrder(order: Order): Promise<void> {
  if (!(await enabled())) return;
  const items = order.items
    .map((it) => `• ${esc(it.name)}${it.variation ? ` (${esc(it.variation)})` : ""} × ${it.quantity}`)
    .join("\n");
  const where = [order.shipping_city, order.shipping_branch].filter(Boolean).map(esc).join(", ");
  const tag = order.source === "manual" ? " 🖐" : "";
  const text =
    `🛍 <b>Нове замовлення ${esc(order.number)}</b>${tag}\n` +
    `${esc(order.first_name)} ${esc(order.last_name)} · ${esc(order.phone)}\n` +
    (where ? `📦 ${where}\n` : "") +
    `\n${items}\n\n` +
    `💰 <b>${order.total.toLocaleString("uk-UA")} ₴</b> · ${order.payment_method === "prepay" ? "передоплата" : "накладений платіж"}`;
  try { await sendTelegram(text); } catch { /* best-effort */ }
}

/**
 * After a sale, auto-alert the owner about the just-sold sizes that are now low
 * or out of stock — so reordering happens without anyone watching the dashboard.
 * Threshold from settings `low_stock_threshold` (default 2). Best-effort.
 */
export async function notifyLowStockForOrder(orderId: number): Promise<void> {
  if (!(await enabled())) return;
  const t = Number(await getSetting("low_stock_threshold"));
  const threshold = Number.isFinite(t) && t > 0 ? t : 2;
  try {
    const rows = await q<{ name: string; brand: string; size: string; stock_qty: number }>(
      `SELECT p.name, p.brand, v.size, v.stock_qty
         FROM order_items oi
         JOIN product_variants v ON v.product_id = oi.product_id AND v.size = oi.variation AND v.active
         JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1 AND v.stock_qty <= $2
        ORDER BY v.stock_qty ASC`,
      [orderId, threshold],
    );
    if (!rows.length) return;
    const lines = rows.map((r) =>
      `• ${esc(r.name)} ${esc(r.brand)} — ${esc(r.size)}: <b>${r.stock_qty === 0 ? "немає" : r.stock_qty + " шт"}</b>`,
    ).join("\n");
    await sendTelegram(`⚠️ <b>Закінчується на складі</b> (після продажу)\n\n${lines}\n\nВарто запланувати закупівлю.`);
  } catch { /* best-effort */ }
}

/** Fire a status-change message. Non-blocking. */
export async function notifyStatusChange(order: Order, newStatus: string): Promise<void> {
  if (!(await enabled())) return;
  const text =
    `🔄 <b>${esc(order.number)}</b> → ${esc(STATUS_LABELS[newStatus] ?? newStatus)}\n` +
    `${esc(order.first_name)} ${esc(order.last_name)} · ${order.total.toLocaleString("uk-UA")} ₴`;
  try { await sendTelegram(text); } catch { /* best-effort */ }
}
