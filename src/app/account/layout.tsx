// The protected account pages (profile / orders / wishlist) each guard
// themselves with getSessionAccount() + redirect("/account/login"). The login
// and register pages live under this same segment, so this layout must NOT
// redirect — otherwise /account/login redirects to itself in an infinite loop.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
