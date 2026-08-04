import { SizeGuide, type SizeGuideStep } from "@/components/SizeGuide";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Таблиця розмірів одягу",
  alternates: { canonical: "/rozmiry-odyagu" },
  description:
    "Розмірні таблиці одягу: жіночий і чоловічий. Відповідність міжнародного розміру обхватам грудей, талії та стегон у сантиметрах.",
};

const STEPS: SizeGuideStep[] = [
  {
    n: "01",
    title: "Груди",
    text: "Сантиметр по найвиступніших точках, паралельно підлозі. Не затягуйте — стрічка має лежати вільно.",
  },
  {
    n: "02",
    title: "Талія",
    text: "По найвужчому місцю, зазвичай трохи вище пупка. Міряйте на видиху, не втягуючи живіт.",
  },
  {
    n: "03",
    title: "Стегна",
    text: "По найширшій частині, ноги разом. Для брюк і спідниць це головний вимір.",
  },
  {
    n: "04",
    title: "Звірте з таблицею",
    text: "Якщо виміри потрапляють у різні розміри — орієнтуйтеся на більший і на ту частину, яка для речі критична.",
  },
];

export default function ClothingSizesPage() {
  return (
    <SizeGuide
      type="clothing"
      title="Розміри одягу"
      intro="Європейські бренди маркують одяг по-різному, тому надійніше звірятися не з літерою на етикетці, а з власними вимірами в сантиметрах."
      stepsTitle="Три виміри, які вирішують"
      steps={STEPS}
      otherHref="/rozmiry-vzuttya"
      otherLabel="Розміри взуття →"
    />
  );
}
