/**
 * Monobank Acquiring — оплата карткою онлайн.
 *
 * Потік: створюємо рахунок (invoice) → ведемо покупця на `pageUrl` монобанку →
 * банк б'є вебхуком на наш `webHookUrl` → ми позначаємо замовлення оплаченим.
 *
 * ⚠️ Вебхуку самому по собі НЕ віримо. Підпис перевіряємо (ECDSA-SHA256 по
 * сирому тілу запиту), але навіть після цього перепитуємо статус рахунку через
 * API. Так підроблене чи застаріле повідомлення не зробить замовлення
 * оплаченим — джерело правди завжди банк, а не тіло запиту.
 *
 * Суми в API — у копійках (мінорних одиницях), валюта — ISO 4217 (980 = UAH).
 *
 * Server-only.
 */

import crypto from "crypto";
import { getSetting } from "./settings";
import { SITE_URL } from "./siteUrl";

const API = "https://api.monobank.ua/api/merchant";
const UAH = 980;

/** Статуси рахунку в монобанку. */
export type MonoStatus =
  | "created"
  | "processing"
  | "hold"
  | "success"
  | "failure"
  | "reversed"
  | "expired";

export type MonoInvoice = {
  invoiceId: string;
  pageUrl: string;
};

export type MonoInvoiceStatus = {
  invoiceId: string;
  status: MonoStatus;
  amount: number;
  ccy: number;
  reference?: string;
  failureReason?: string;
  errCode?: string;
  modifiedDate?: string;
  paymentInfo?: { maskedPan?: string; approvalCode?: string; rrn?: string; paymentSystem?: string };
};

/** Токен з env має пріоритет над збереженим в адмінці — як у решти інтеграцій. */
export async function resolveMonoToken(): Promise<string | null> {
  return process.env.MONOBANK_TOKEN || (await getSetting("monobank_token")) || null;
}

export async function monoTokenSource(): Promise<"env" | "settings" | "none"> {
  if (process.env.MONOBANK_TOKEN) return "env";
  return (await getSetting("monobank_token")) ? "settings" : "none";
}

export async function isMonoEnabled(): Promise<boolean> {
  const on = (await getSetting("monobank_enabled")) === "1";
  return on && !!(await resolveMonoToken());
}

async function monoFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const token = init.token || (await resolveMonoToken());
  if (!token) throw new Error("Токен monobank не налаштовано");

  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Token": token,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    // Монобанк повертає {errCode, errText} — показуємо саме його, а не «500».
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { errText?: string; errCode?: string };
      if (j.errText) msg = `${j.errText}${j.errCode ? ` (${j.errCode})` : ""}`;
    } catch { /* не JSON — лишаємо як є */ }
    throw new Error(msg || `monobank HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

export type BasketItem = { name: string; qty: number; sum: number; unit?: string; code?: string };

/**
 * @param amount сума в гривнях (переводимо в копійки тут, щоб решта коду не
 *   думала про мінорні одиниці)
 */
export async function createInvoice(input: {
  orderId: number;
  orderNumber: string;
  amount: number;
  basket?: BasketItem[];
  validitySec?: number;
}): Promise<MonoInvoice> {
  const amountKop = Math.round(input.amount * 100);
  if (amountKop <= 0) throw new Error("Сума замовлення має бути більшою за нуль");

  return monoFetch<MonoInvoice>("/invoice/create", {
    method: "POST",
    body: JSON.stringify({
      amount: amountKop,
      ccy: UAH,
      merchantPaymInfo: {
        reference: String(input.orderId),
        destination: `Замовлення ${input.orderNumber} — Mania Group`,
        basketOrder: (input.basket ?? []).map((b) => ({
          name: b.name.slice(0, 120),
          qty: b.qty,
          sum: Math.round(b.sum * 100),
          unit: b.unit ?? "шт",
          code: b.code ?? "",
        })),
      },
      redirectUrl: `${SITE_URL}/checkout/done?order=${input.orderId}`,
      webHookUrl: `${SITE_URL}/api/payments/monobank/webhook`,
      validity: input.validitySec ?? 60 * 60 * 24,
      paymentType: "debit",
    }),
  });
}

export async function getInvoiceStatus(invoiceId: string): Promise<MonoInvoiceStatus> {
  return monoFetch<MonoInvoiceStatus>(
    `/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
    { method: "GET" },
  );
}

/** Перевірка токена без збереження — для кнопки «Перевірити» в адмінці. */
export async function testMonoToken(token?: string): Promise<{ ok: true; merchant: string } | { ok: false; error: string }> {
  try {
    const d = await monoFetch<{ merchantId?: string; merchantName?: string }>("/details", {
      method: "GET",
      token,
    });
    return { ok: true, merchant: d.merchantName || d.merchantId || "невідомий мерчант" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Помилка з'єднання" };
  }
}

/* ── перевірка підпису вебхука ─────────────────────────────────────────── */

let pubKeyCache: { key: string; at: number } | null = null;
const PUBKEY_TTL_MS = 60 * 60 * 1000;

async function getPublicKey(): Promise<string> {
  if (pubKeyCache && Date.now() - pubKeyCache.at < PUBKEY_TTL_MS) return pubKeyCache.key;
  const d = await monoFetch<{ key: string }>("/pubkey", { method: "GET" });
  pubKeyCache = { key: d.key, at: Date.now() };
  return d.key;
}

/**
 * Підпис — ECDSA-SHA256 по СИРОМУ тілу запиту, тому в роут має приходити
 * `await req.text()`, а не розпарсений JSON: будь-яка нормалізація (пробіли,
 * порядок ключів) зламала б перевірку.
 */
export async function verifyWebhook(rawBody: string, xSign: string | null): Promise<boolean> {
  if (!xSign) return false;
  try {
    const keyB64 = await getPublicKey();
    const publicKey = Buffer.from(keyB64, "base64").toString("utf-8"); // PEM
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(xSign, "base64"));
  } catch {
    return false;
  }
}

/** Статус монобанку → наш `orders.payment_status`. */
export function mapPaymentStatus(s: MonoStatus): "paid" | "unpaid" | "failed" | "refunded" | "pending" {
  switch (s) {
    case "success":
      return "paid";
    case "hold":
    case "processing":
    case "created":
      return "pending";
    case "reversed":
      return "refunded";
    case "failure":
    case "expired":
      return "failed";
    default:
      return "unpaid";
  }
}
