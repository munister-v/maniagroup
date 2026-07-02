import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { ToastProvider } from "@/components/Toast";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mania Group · ERP", robots: { index: false, follow: false } };

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <ToastProvider>
      <div className="fixed inset-0 z-[70] overflow-hidden bg-[#f4f2ee] font-sans text-[#17130f]">
        {children}
      </div>
    </ToastProvider>
  );
}
