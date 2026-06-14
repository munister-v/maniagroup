import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { getSiteContent } from "@/lib/siteContent";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const content = await getSiteContent();
  const hasWcCreds = !!(process.env.WOOCOMMERCE_KEY && process.env.WOOCOMMERCE_SECRET);
  return <AdminDashboard initial={content} hasWcCreds={hasWcCreds} />;
}
