import Link from "next/link";
import { getSiteContent } from "@/lib/siteContent";

export const metadata = {
  title: "Контакти — Mania Group",
  description: "Телефон, e-mail та соціальні мережі Mania Group.",
};

export default async function ContactsPage() {
  const { phone, email, instagram, facebook } = (await getSiteContent()).contacts;

  return (
    <section className="wrap py-12 md:py-16">
      <p className="text-[11px] uppercase tracking-luxe text-muted">
        <Link href="/" className="link-underline">
          Головна
        </Link>{" "}
        / Контакти
      </p>
      <h1 className="mt-2 font-display text-3xl text-ink md:text-4xl">Контакти</h1>

      <div className="mt-10 max-w-md space-y-5 text-sm leading-relaxed">
        {phone && (
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Телефон</p>
            <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-1 block text-ink hover:opacity-60">
              {phone}
            </a>
            <p className="mt-1 text-xs text-muted">Щодня з 9:00 до 20:00</p>
          </div>
        )}
        {email && (
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">E-mail</p>
            <a href={`mailto:${email}`} className="mt-1 block text-ink hover:opacity-60">
              {email}
            </a>
          </div>
        )}
        {(instagram || facebook) && (
          <div>
            <p className="text-[11px] uppercase tracking-luxe text-muted">Соцмережі</p>
            <div className="mt-1 flex gap-4 text-ink">
              {instagram && (
                <a href={instagram} target="_blank" rel="noopener noreferrer" className="hover:opacity-60">
                  Instagram
                </a>
              )}
              {facebook && (
                <a href={facebook} target="_blank" rel="noopener noreferrer" className="hover:opacity-60">
                  Facebook
                </a>
              )}
            </div>
          </div>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-luxe text-muted">Доставка</p>
          <p className="mt-1 text-muted">Новою Поштою по всій Україні</p>
        </div>
      </div>
    </section>
  );
}
