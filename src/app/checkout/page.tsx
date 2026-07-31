import { CheckoutForm } from "@/components/CheckoutForm";
import { isMonoEnabled } from "@/lib/monobank";

export const metadata = {
  title: "Оформлення замовлення — Mania Group",
};

export default async function CheckoutPage() {
  return <CheckoutForm cardEnabled={await isMonoEnabled()} />;
}
