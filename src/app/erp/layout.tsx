import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mania Group · ERP", robots: { index: false, follow: false } };

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#f4f2ee] font-sans text-[#17130f]">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#e2ddd5] bg-white px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium tracking-[0.2em]">MANIA GROUP</span>
          <span className="rounded-[3px] bg-[#17130f] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-white">ERP</span>
        </div>
        <nav className="flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-[#9c8f7d]">
          <Link href="/admin" className="rounded-[3px] px-3 py-1.5 transition-colors hover:text-[#17130f]">Адмінка</Link>
          <Link href="/" className="rounded-[3px] px-3 py-1.5 transition-colors hover:text-[#17130f]">Сайт</Link>
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
