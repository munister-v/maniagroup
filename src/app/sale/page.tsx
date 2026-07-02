import { redirect } from "next/navigation";

// "Sale" is a saved view of the catalog — discounted products only.
// Keep a clean /sale URL for the header link; the catalog does the work.
export default function SalePage() {
  redirect("/catalog?sale=1");
}
