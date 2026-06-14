import Link from "next/link";

export const metadata = {
  title: "Обмін і повернення — Mania Group",
  description: "Умови обміну та повернення товарів у Mania Group.",
};

export default function ReturnsPage() {
  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        / Обмін і повернення
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Обмін і повернення</h1>

      <div className="mt-10 max-w-2xl space-y-6 text-sm leading-relaxed text-muted">
        <p>
          Якщо розмір або модель не підійшли — у вас є{" "}
          <span className="text-ink">14 днів</span> з дня отримання замовлення,
          щоб обміняти товар або повернути кошти.
        </p>
        <div>
          <h2 className="mb-2 text-[12px] uppercase tracking-luxe text-ink">Умови повернення</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Товар не використовувався, етикетки та упаковка збережені.</li>
            <li>Взуття повертається у фабричній коробці без слідів носіння.</li>
            <li>Парфуми та аромати для дому обміну/поверненню не підлягають, окрім випадків браку.</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-[12px] uppercase tracking-luxe text-ink">Як оформити</h2>
          <p>
            Зв&rsquo;яжіться з нами за телефоном{" "}
            <a href="tel:+380963436035" className="text-ink hover:opacity-60">
              +38 (096) 343-60-35
            </a>{" "}
            — підкажемо адресу відправлення та оформимо обмін або повернення коштів
            після отримання товару.
          </p>
        </div>
      </div>
    </section>
  );
}
