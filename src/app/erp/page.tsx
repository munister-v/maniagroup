import { redirect } from "next/navigation";
import { ADMIN_BASE } from "@/lib/adminPath";

export const dynamic = "force-dynamic";

export default function ErpPage() {
  redirect(ADMIN_BASE);
}
