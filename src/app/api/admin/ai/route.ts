import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { q, q1 } from "@/lib/pg";
import { orChat } from "@/lib/openRouter";

export const dynamic = "force-dynamic";

// ── Build rich store context from DB ────────────────────────────────────────

async function buildContext() {
  const now = new Date();
  const y7   = new Date(now); y7.setDate(now.getDate() - 7);
  const y30  = new Date(now); y30.setDate(now.getDate() - 30);

  const [kpis, recentOrders, topProducts, inventory, lowStock, pendingOrders] = await Promise.all([
    // Revenue KPIs
    q1<{ rev7: string; rev30: string; orders7: string; orders30: string; avg30: string }>(
      `SELECT
        COALESCE(SUM(total) FILTER (WHERE created_at >= $1 AND status NOT IN ('cancelled','refunded')),0)::int::text AS rev7,
        COALESCE(SUM(total) FILTER (WHERE created_at >= $2 AND status NOT IN ('cancelled','refunded')),0)::int::text AS rev30,
        COUNT(*)           FILTER (WHERE created_at >= $1 AND status NOT IN ('cancelled','refunded'))::text AS orders7,
        COUNT(*)           FILTER (WHERE created_at >= $2 AND status NOT IN ('cancelled','refunded'))::text AS orders30,
        COALESCE(AVG(total) FILTER (WHERE created_at >= $2 AND status NOT IN ('cancelled','refunded')),0)::int::text AS avg30
       FROM orders`,
      [y7.toISOString(), y30.toISOString()],
    ),

    // Last 8 orders
    q<{ number: string; status: string; first_name: string; last_name: string; total: string; created_at: string; shipping_city: string }>(
      `SELECT number, status, first_name, last_name, total, created_at, shipping_city
       FROM orders ORDER BY created_at DESC LIMIT 8`,
    ),

    // Top 8 products last 30 days
    q<{ name: string; brand: string; qty: string; revenue: string }>(
      `SELECT oi.name, oi.brand, SUM(oi.quantity)::text AS qty, SUM(oi.line_total)::int::text AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1 AND o.status NOT IN ('cancelled','refunded')
       GROUP BY oi.name, oi.brand ORDER BY SUM(oi.line_total) DESC LIMIT 8`,
      [y30.toISOString()],
    ),

    // Inventory summary
    q1<{ total: string; in_stock: string; out_stock: string; no_photo: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE is_in_stock)::text AS in_stock,
              COUNT(*) FILTER (WHERE NOT is_in_stock)::text AS out_stock,
              COUNT(*) FILTER (WHERE images::text IN ('[]','null','') OR images IS NULL)::text AS no_photo
       FROM products WHERE status='publish'`,
    ),

    // Brands with ≤3 items in stock
    q<{ brand: string; cnt: string }>(
      `SELECT brand, COUNT(*)::text AS cnt
       FROM products WHERE status='publish' AND is_in_stock=TRUE AND brand <> ''
       GROUP BY brand HAVING COUNT(*) <= 3
       ORDER BY COUNT(*) ASC LIMIT 6`,
    ),

    // Pending orders
    q<{ number: string; first_name: string; last_name: string; total: string }>(
      `SELECT number, first_name, last_name, total::int::text AS total
       FROM orders WHERE status IN ('pending','processing') ORDER BY created_at DESC LIMIT 5`,
    ),
  ]);

  const fmtDate = (s: string) => new Date(s).toLocaleString("uk-UA", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });

  return {
    today: now.toLocaleDateString("uk-UA", { weekday:"long", day:"numeric", month:"long", year:"numeric" }),
    kpis: {
      revenue_7d: `${Number(kpis?.rev7).toLocaleString("uk-UA")} ₴`,
      revenue_30d: `${Number(kpis?.rev30).toLocaleString("uk-UA")} ₴`,
      orders_7d: kpis?.orders7,
      orders_30d: kpis?.orders30,
      avg_order_30d: `${Number(kpis?.avg30).toLocaleString("uk-UA")} ₴`,
    },
    inventory: {
      total: inventory?.total,
      in_stock: inventory?.in_stock,
      out_stock: inventory?.out_stock,
      no_photo: inventory?.no_photo,
    },
    recent_orders: recentOrders.map((o) => ({
      number: o.number,
      customer: `${o.first_name} ${o.last_name}`,
      city: o.shipping_city,
      total: `${Number(o.total).toLocaleString("uk-UA")} ₴`,
      status: o.status,
      date: fmtDate(o.created_at),
    })),
    top_products_30d: topProducts.map((p) => ({
      name: p.name,
      brand: p.brand,
      qty: p.qty,
      revenue: `${Number(p.revenue).toLocaleString("uk-UA")} ₴`,
    })),
    low_stock_brands: lowStock.map((b) => ({ brand: b.brand, items_left: b.cnt })),
    pending_orders: pendingOrders.map((o) => ({
      number: o.number,
      customer: `${o.first_name} ${o.last_name}`,
      total: `${Number(o.total).toLocaleString("uk-UA")} ₴`,
    })),
  };
}

const SYSTEM = `Ти — розумний AI-асистент адміністратора інтернет-магазину брендового одягу «Mania Group» (Україна).
Відповідай ВИКЛЮЧНО українською мовою. Будь лаконічним, конкретним і корисним.
У тебе є реальні дані магазину у форматі JSON нижче. Спирайся лише на ці дані.
Не вигадуй числа — якщо даних немає, так і скажи.
Для дайджесту — 3–6 коротких пунктів із реальними цифрами й практичними рекомендаціями.
Для чату — відповідай коротко й по суті.`;

// ── POST /api/admin/ai ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action: string; message?: string; product?: Record<string, string>; history?: { role: string; content: string }[]; field?: string; text?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, message, product, history = [] } = body;

  try {

  // ── AI-дайджест (огляд магазину) ────────────────────────────────────
  if (action === "insights") {
    const ctx = await buildContext();
    const text = await orChat([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Дані магазину:\n${JSON.stringify(ctx, null, 2)}\n\nСкладіть короткий ранковий дайджест для адміністратора. Формат: маркований список (через •). Включи: стан замовлень, виручку, увагу до pending-замовлень, стан залишків, 1 практичну пораду. Без вступних фраз — одразу до суті.`,
      },
    ], { maxTokens: 600, temperature: 0.5 });

    return NextResponse.json({ text });
  }

  // ── Чат-асистент (вільні запитання) ─────────────────────────────────
  if (action === "chat") {
    if (!message?.trim()) return NextResponse.json({ error: "empty message" }, { status: 400 });

    const ctx = await buildContext();
    const messages = [
      { role: "system" as const, content: `${SYSTEM}\n\nДані магазину станом на ${ctx.today}:\n${JSON.stringify(ctx, null, 2)}` },
      ...history.slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    const text = await orChat(messages, { maxTokens: 700, temperature: 0.7 });
    return NextResponse.json({ text });
  }

  // ── Генератор Instagram/Telegram поста для товару ─────────────────
  if (action === "social-post") {
    if (!product) return NextResponse.json({ error: "no product" }, { status: 400 });

    const prompt = `Товар магазину Mania Group:
Назва: ${product.name}
Бренд: ${product.brand}
Категорія: ${product.category}
Колір: ${product.color || "—"}
Сезон: ${product.season || "—"}
Склад: ${product.composition || "—"}
Ціна: ${product.price} ₴${product.oldPrice ? ` (знижка з ${product.oldPrice} ₴)` : ""}
Наявність: ${product.inStock === "true" ? "В наявності" : "Немає в наявності"}

Напиши 2 варіанти рекламного поста для Instagram Stories та Telegram магазину одягу:
— Варіант 1: емоційний, з емодзі, для Instagram (до 200 символів)
— Варіант 2: інформативний, для Telegram (до 280 символів, з цінами та деталями)
Мова: українська. Стиль: преміум, стильно, коротко. Наприкінці — 5–7 хештегів.`;

    const text = await orChat([
      { role: "system", content: "Ти SMM-копірайтер для магазину брендового одягу Mania Group (Україна). Стиль — преміум, лаконічно, по-українськи." },
      { role: "user", content: prompt },
    ], { maxTokens: 600, temperature: 0.85 });

    return NextResponse.json({ text });
  }

  // ── Генератор опису для картки товару ────────────────────────────
  if (action === "product-desc") {
    if (!product) return NextResponse.json({ error: "no product" }, { status: 400 });

    const prompt = `Товар: ${product.name} / Бренд: ${product.brand} / Категорія: ${product.category} / Колір: ${product.color || "—"} / Сезон: ${product.season || "—"} / Склад: ${product.composition || "—"}

Напиши короткий продаючий опис для картки товару (3–4 речення, українською). Стиль — преміум, природньо, без кліше типу "неперевершений". Опиши відчуття від носіння та стиль.`;

    const text = await orChat([
      { role: "system", content: "Ти копірайтер для магазину брендового одягу. Пишеш природніми, живими текстами українською мовою." },
      { role: "user", content: prompt },
    ], { maxTokens: 300, temperature: 0.8 });

    return NextResponse.json({ text });
  }

  // ── Покращення контенту (SEO, hero, опис) ───────────────────────────
  if (action === "content-improve") {
    const { field, text, context } = body as { field?: string; text?: string; context?: string };
    if (!text?.trim()) return NextResponse.json({ error: "empty text" }, { status: 400 });

    const prompt = `Поле: "${field || "текст"}"
Контекст: ${context || "контент сайту магазину брендового одягу Mania Group (Україна)"}
Поточний текст:
"""
${text}
"""

Покращ або перефразуй цей текст: зроби його точнішим, живим, переконливим. Зберігай смисл та мову оригіналу (якщо українська — залишай українською). Відповідь — ТІЛЬКИ покращений текст, без пояснень і лапок.`;

    const improved = await orChat([
      { role: "system", content: "Ти копірайтер для магазину брендового одягу Mania Group. Пишеш чисто, лаконічно, природньою українською мовою." },
      { role: "user", content: prompt },
    ], { maxTokens: 400, temperature: 0.72 });

    return NextResponse.json({ text: improved.trim() });
  }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[AI route]", msg);
    return NextResponse.json({ error: `ШІ недоступний: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
