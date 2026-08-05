import Link from "next/link";
import { getOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Оплата замовлення",
  robots: { index: false, follow: false },
};

/**
 * Сторінка повернення з монобанку.
 *
 * ⚠️ Банк повертає покупця сюди ОДРАЗУ, а вебхук про оплату може прийти на
 * секунду-дві пізніше. Тому «ще обробляється» — не помилка, а нормальний стан:
 * показуємо його спокійно й даємо оновити. Статус беремо з нашої бази, куди
 * його кладе перевірений вебхук, а не з параметрів URL — їх можна підробити.
 */
export default async function CheckoutDonePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderParam } = await searchParams;
  const orderId = Number(orderParam) || 0;
  const order = orderId ? await getOrder(orderId) : null;

  const paid = order?.payment_status === "paid";
  const failed = order?.payment_status === "failed";

  return (
    <section className="wrap flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      {paid ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-luxe text-muted">Оплату отримано</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Дякуємо!</h1>
          {order && (
            <p className="mt-3 text-sm text-muted">
              Замовлення <span className="text-ink">{order.number}</span> оплачено на{" "}
              <span className="text-ink">{Number(order.total).toLocaleString("uk-UA")} ₴</span>.
              Ми зв&apos;яжемося з вами щодо відправлення.
            </p>
          )}
        </>
      ) : failed ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-700">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-luxe text-muted">Оплата не пройшла</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Спробуйте ще раз</h1>
          <p className="mt-3 max-w-md text-sm text-muted">
            Гроші не списані. Замовлення {order?.number ? <span className="text-ink">{order.number}</span> : null} збережено —
            зв&apos;яжіться з нами, і ми надішлемо нове посилання на оплату.
          </p>
        </>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cloud text-ink">
            <svg viewBox="0 0 24 24" className="h-8 w-8 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 3a9 9 0 109 9" strokeLinecap="round" />
            </svg>
          </div>
          <p className="mt-6 text-[11px] uppercase tracking-luxe text-muted">Перевіряємо оплату</p>
          <h1 className="mt-2 font-display text-3xl text-ink">Замовлення прийнято</h1>
          <p className="mt-3 max-w-md text-sm text-muted">
            {order?.number ? <>Замовлення <span className="text-ink">{order.number}</span>. </> : null}
            Банк ще підтверджує платіж — це займає кілька секунд. Оновіть сторінку
            або просто дочекайтеся нашого дзвінка: замовлення вже у нас.
          </p>
        </>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/catalog"
          className="h-11 rounded-[3px] bg-ink px-6 text-[12px] uppercase leading-[44px] tracking-luxe text-paper transition-opacity hover:opacity-85"
        >
          Продовжити покупки
        </Link>
        <Link
          href="/account/orders"
          className="h-11 rounded-[3px] border border-line px-6 text-[12px] uppercase leading-[44px] tracking-luxe text-ink transition-colors hover:border-ink"
        >
          Мої замовлення
        </Link>
      </div>
    </section>
  );
}
