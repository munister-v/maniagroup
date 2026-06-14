"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/catalog";
import { cartItemPriceUah, type WcCart } from "@/lib/wcCart";
import { wcStateForArea } from "@/lib/uaRegions";
import { NovaPoshtaPicker, type NpSelection } from "@/components/NovaPoshtaPicker";

type Form = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  address_1: string;
  postcode: string;
  note: string;
};

const EMPTY: Form = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  state: "",
  city: "",
  address_1: "",
  postcode: "",
  note: "",
};

export function CheckoutForm() {
  const [cart, setCart] = useState<WcCart | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cart");
    setCart(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onDelivery(s: NpSelection) {
    setForm((f) => ({
      ...f,
      city: s.city,
      state: wcStateForArea(s.area),
      address_1: s.warehouse,
      postcode: s.postcode,
    }));
  }

  const deliveryReady = Boolean(form.city && form.address_1 && form.state);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billing: {
          first_name: form.first_name,
          last_name: form.last_name,
          address_1: form.address_1,
          city: form.city,
          state: form.state,
          postcode: form.postcode,
          country: "UA",
          email: form.email,
          phone: form.phone,
        },
        note: form.note,
      }),
    });
    const data = await res.json();
    setStatus("idle");
    if (data.ok) {
      setOrder(data.orderId);
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: 0 } }));
    } else {
      setError(data.message ?? "Сталася помилка. Спробуйте ще раз.");
    }
  }

  if (order) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <p className="text-[11px] uppercase tracking-luxe text-muted">Дякуємо за замовлення</p>
        <h1 className="mt-3 font-display text-4xl text-ink">Замовлення №{order}</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
          Ми зв&rsquo;яжемося з вами найближчим часом для підтвердження. Оплата —
          при отриманні (накладений платіж).
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
        >
          На головну
        </Link>
      </section>
    );
  }

  const items = cart?.items ?? [];
  const subtotal = cart
    ? Math.round(Number(cart.totals.total_price) / 10 ** cart.totals.currency_minor_unit)
    : 0;

  if (cart && items.length === 0) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <h1 className="font-display text-3xl text-ink">Кошик порожній</h1>
        <Link
          href="/catalog"
          className="mt-6 inline-flex h-12 items-center bg-ink px-8 text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85"
        >
          До каталогу
        </Link>
      </section>
    );
  }

  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        / Оформлення
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Оформлення замовлення</h1>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
        <form onSubmit={submit} className="space-y-8">
          <fieldset className="space-y-4">
            <legend className="text-[12px] uppercase tracking-luxe text-muted">Контактні дані</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ім'я" value={form.first_name} onChange={(v) => set("first_name", v)} required />
              <Field label="Прізвище" value={form.last_name} onChange={(v) => set("last_name", v)} required />
              <Field label="Телефон" value={form.phone} onChange={(v) => set("phone", v)} type="tel" required />
              <Field label="E-mail" value={form.email} onChange={(v) => set("email", v)} type="email" required />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-[12px] uppercase tracking-luxe text-muted">
              Доставка · Нова Пошта
            </legend>
            <NovaPoshtaPicker onChange={onDelivery} />
            {form.address_1 && (
              <p className="text-xs text-muted">
                Обрано: {form.city}, {form.address_1}
              </p>
            )}
          </fieldset>

          <label className="block">
            <span className="text-[11px] uppercase tracking-luxe text-muted">Коментар до замовлення</span>
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={3}
              className="mt-2 w-full border border-line bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

          {error && <p className="text-sm text-[#b3392c]">{error}</p>}

          <button
            type="submit"
            disabled={status === "submitting" || !deliveryReady}
            className="h-12 w-full bg-ink text-[12px] uppercase tracking-luxe text-paper transition-opacity hover:opacity-85 disabled:opacity-50 sm:w-auto sm:px-12"
          >
            {status === "submitting" ? "Оформлюємо…" : "Підтвердити замовлення"}
          </button>
          <p className="text-xs text-muted">Оплата при отриманні (накладений платіж).</p>
        </form>

        <aside className="lg:sticky lg:top-28 lg:h-fit">
          <div className="border border-line p-6">
            <h2 className="text-[12px] uppercase tracking-luxe text-muted">Ваше замовлення</h2>
            <div className="mt-5 space-y-4">
              {items.map((it) => (
                <div key={it.key} className="flex gap-3">
                  <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-cloud">
                    {it.images[0]?.src && (
                      <Image src={it.images[0].src} alt={it.name} fill sizes="56px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="leading-snug text-ink">{it.name}</p>
                    <p className="mt-1 text-xs text-muted">× {it.quantity}</p>
                  </div>
                  <span className="text-sm tabular-nums text-ink">{formatPrice(cartItemPriceUah(it))}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-baseline justify-between border-t border-line pt-5">
              <span className="text-[12px] uppercase tracking-luxe text-muted">Разом</span>
              <span className="font-display text-2xl text-ink">{formatPrice(subtotal)}</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-luxe text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none"
      />
    </label>
  );
}
