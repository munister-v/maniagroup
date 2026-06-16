# Mania Group — план максимального апгрейда админки (супер-редактор + CRM)

Статус: согласован 2026-06-16. Строим по фазам, деплой инкрементально (git-pull на VPS).
Выбран старт: **Фаза 4 (Супер-редактор)**.

## Фундамент (уже есть)
- Auth: один пароль (env `ADMIN_PASSWORD` / хеш в `store_settings`), HMAC-cookie, 7 дней. Один админ.
- БД (Postgres, `src/lib/pg.ts`): products, categories, orders/order_items, accounts/sessions,
  carts/cart_items, wishlist, subscribers, store_settings, sync_meta.
- Разделы (`AdminDashboard.tsx`, `Section` type): overview, content, catalog (XLS), products,
  orders, customers, subscribers, backup, settings.
- CMS статичных текстов: `src/lib/siteContent.ts` (JSON `data/site-content.json`, deepMerge с DEFAULT_CONTENT).
- Заказы: список + смена статуса (`updateOrderStatus`) + экспорт. Клиенты: orders_count/total_spent/wishlist.

## Фаза 1. CRM-ядро (заказы + клиенты)
- Карточка заказа: внутренние заметки + таймлайн (order_notes, order_events), правка позиций/адреса,
  поле TTN Нової Пошти + tracking_url, печать/invoice PDF.
- Ручное создание заказа (телефон/Instagram-продажи).
- Списание stock_qty при заказе, возврат при отмене.
- Карточка клиента: теги, сегменты (RFM: новый/постоянный/VIP/спящий), заметки, last_order, LTV, AOV, лог контактов.
- Новые таблицы: order_notes, order_events, customer_tags, customer_notes; поля orders.ttn, orders.tracking_url.

## Фаза 2. Уведомления
- Telegram-бот: пинг при новом заказе (token + chat_id в настройках).
- Транзакционная почта (Resend/SMTP): подтверждение, смена статуса, отправка+TTN.
- Настройки канала в разделе Налаштування.

## Фаза 3. Маркетинг
- Промокоды/скидки: таблица coupons (код, %/₴, мин.сумма, срок, лимит), применение в checkout, CRUD.
- Рассылка подписчикам (редактор + отправка через Фазу 2).
- Брошенные корзины: вью по carts/cart_items старше N часов без заказа + «напомнить».

## Фаза 4. Супер-редактор контента ← ТЕКУЩАЯ
- 4a. SEO/мета-редактор: вынести layout.tsx константы (SITE_NAME, description, keywords, OG, JSON-LD)
      в SiteContent.seo; вкладка «SEO» в Контенте.
- 4b. Конструктор главной: SiteContent.homeSections — упорядоченный список секций с флагом enabled;
      page.tsx рендерит по конфигу; админ-UI reorder + вкл/выкл.
- 4c. Медиа-библиотека: листинг /public/uploads, picker/переиспользование; раздел «Медіа».
- 4d. Футер + анонс: SiteContent.footer (колонки/ссылки/о-тексте), баннер-анонс с расписанием (date window).

## Фаза 5. Каталог-про
- Матрица размер×остаток в редакторе товара, drag-reorder фото, дубликат товара.
- CRUD категорий/брендов/коллекций (не только из XLS).
- Курирование: рекомендовані / на головну / лукбуки.
- Bulk-правила цен (скидка X% на бренд/категорию).

## Фаза 6. Платформа админки
- Роли и staff-аккаунты (owner/manager/content) вместо одного пароля.
- Журнал действий (audit log).
- Колокол уведомлений (новые заказы), глобальный поиск, опц. 2FA.

## Фаза 7. Аналитика-про
- Графики продаж по периодам/брендам/категориям, воронка, топ-товары, когорты.
- Алерты низкого остатка, экспортируемые отчёты.
