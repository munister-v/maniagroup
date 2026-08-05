import type { Metadata } from "next";

/**
 * Кабінет покупця цілком закритий від індексації. Одне місце замість robots на
 * кожній сторінці: сюди потрапляє і /account/forgot-password, яка є клієнтським
 * компонентом і власних metadata експортувати не може. Сторінки нижче спокійно
 * задають свій title — robots успадкується звідси.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// The protected account pages (profile / orders / wishlist) each guard
// themselves with getSessionAccount() + redirect("/account/login"). The login
// and register pages live under this same segment, so this layout must NOT
// redirect — otherwise /account/login redirects to itself in an infinite loop.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
