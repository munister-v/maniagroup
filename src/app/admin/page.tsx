import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/adminAuth";
import { getEditableContent } from "@/lib/siteContent";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ADMIN_LOGIN } from "@/lib/adminPath";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect(ADMIN_LOGIN);
  const content = await getEditableContent();
  const hasWcCreds = !!(process.env.WOOCOMMERCE_KEY && process.env.WOOCOMMERCE_SECRET);
  return <AdminDashboard initial={content} hasWcCreds={hasWcCreds} />;
}
