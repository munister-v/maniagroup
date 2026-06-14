import Link from "next/link";

export const metadata = {
  title: "Доставка та оплата — Mania Group",
  description: "Умови доставки Новою Поштою та способи оплати в Mania Group.",
};

export default function DeliveryPage() {
  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        / Доставка та оплата
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Доставка та оплата</h1>

      <div className="mt-10 grid gap-12 md:grid-cols-2">
        <div>
          <h2 className="text-[12px] uppercase tracking-luxe text-ink">Доставка</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            <p>
              Відправляємо замовлення Новою Поштою по всій Україні — у відділення
              або поштомат за вашим вибором.
            </p>
            <p>
              Доставка <span className="text-ink">безкоштовна від 3 000 ₴</span>.
              Для замовлень меншої суми вартість доставки оплачується одержувачем
              за тарифами Нової Пошти при отриманні.
            </p>
            <p>Термін відправки — 1–2 робочих дні з моменту підтвердження замовлення.</p>
          </div>
        </div>

        <div>
          <h2 className="text-[12px] uppercase tracking-luxe text-ink">Оплата</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            <p>
              Наразі доступна оплата <span className="text-ink">при отриманні</span>{" "}
              (накладений платіж Новою Поштою) — ви оглядаєте замовлення перед
              оплатою.
            </p>
            <p>
              Онлайн-оплата карткою з&rsquo;явиться найближчим часом.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
