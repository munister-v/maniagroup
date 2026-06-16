"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/catalog";
import type { Cart } from "@/lib/cart";
import { NovaPoshtaPicker, type NpSelection } from "@/components/NovaPoshtaPicker";

type Form = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  branch: string;
  note: string;
};

const EMPTY: Form = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  city: "",
  branch: "",
  note: "",
};

export function CheckoutForm() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string | number | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [applying, setApplying] = useState(false);

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
      branch: s.warehouse,
    }));
  }

  const deliveryReady = Boolean(form.city && form.branch);

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setApplying(true);
    setCouponMsg("");
    try {
      const res = await fetch("/api/coupon", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCoupon({ code: data.code, discount: data.discount });
        setCouponMsg(`Знижка −${formatPrice(data.discount)} застосована`);
      } else {
        setCoupon(null);
        setCouponMsg(data.error ?? "Код не застосовано");
      }
    } finally { setApplying(false); }
  }
  function removeCoupon() {
    setCoupon(null); setCouponInput(""); setCouponMsg("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        email: form.email,
        city: form.city,
        branch: form.branch,
        note: form.note,
        payment_method: "cod",
        coupon_code: coupon?.code ?? "",
      }),
    });
    const data = await res.json();
    setStatus("idle");
    if (data.ok) {
      setOrder(data.number ?? data.orderId);
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { count: 0 } }));
    } else {
      setError(data.message ?? "Сталася помилка. Спробуйте ще раз.");
    }
  }

  if (order) {
    return (
      <section className="wrap flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <p className="text-[11px] uppercase tracking-luxe text-muted">Дякуємо за замовлення</p>
        <h1 className="mt-3 font-display text-4xl text-ink">Замовлення {order}</h1>
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
  const subtotal = cart?.subtotal ?? 0;

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
            {form.branch && (
              <p className="text-xs text-muted">
                Обрано: {form.city}, {form.branch}
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
                    {it.image && (
                      <Image src={it.image} alt={it.name} fill sizes="56px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="leading-snug text-ink">{it.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {it.variation ? `${it.variation} · ` : ""}× {it.quantity}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-ink">{formatPrice(it.line_total)}</span>
                </div>
              ))}
            </div>
            {/* Promo code */}
            <div className="mt-6 border-t border-line pt-5">
              {coupon ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Промокод <span className="font-medium text-ink">{coupon.code}</span></span>
                  <button onClick={removeCoupon} className="text-[11px] uppercase tracking-luxe text-muted underline-offset-2 hover:text-ink hover:underline">Прибрати</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                    placeholder="Промокод"
                    className="h-10 flex-1 border border-line bg-white px-3 text-sm uppercase tracking-wide text-ink placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                  <button onClick={applyCoupon} disabled={applying || !couponInput.trim()}
                    className="h-10 shrink-0 border border-ink px-4 text-[11px] uppercase tracking-luxe text-ink transition-colors hover:bg-ink hover:text-paper disabled:opacity-40">
                    {applying ? "…" : "Застосувати"}
                  </button>
                </div>
              )}
              {couponMsg && <p className={`mt-2 text-xs ${coupon ? "text-emerald-700" : "text-[#b3392c]"}`}>{couponMsg}</p>}
            </div>

            <div className="mt-5 space-y-1.5 border-t border-line pt-5">
              <div className="flex items-baseline justify-between text-sm text-muted">
                <span>Сума товарів</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              {coupon && (
                <div className="flex items-baseline justify-between text-sm text-emerald-700">
                  <span>Знижка</span>
                  <span className="tabular-nums">−{formatPrice(coupon.discount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-[12px] uppercase tracking-luxe text-muted">Разом</span>
                <span className="font-display text-2xl text-ink">{formatPrice(Math.max(0, subtotal - (coupon?.discount ?? 0)))}</span>
              </div>
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
