import { CheckoutForm } from "@/components/CheckoutForm";
import { isMonoEnabled } from "@/lib/monobank";

export const metadata = {
  title: "Оформлення замовлення",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  return <CheckoutForm cardEnabled={await isMonoEnabled()} />;
}
