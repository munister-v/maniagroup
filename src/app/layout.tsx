import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getSiteContent } from "@/lib/siteContent";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mania Group — брендовий одяг, взуття та аксесуари",
  description:
    "Інтернет-магазин оригінального брендового одягу, взуття та аксесуарів: EA7 Emporio Armani, Moschino, Antony Morato, MC2 Saint Barth та інші. Доставка по всій Україні.",
};

async function AnnouncementBar() {
  const content = await getSiteContent();
  if (!content.announcement) return null;
  return (
    <div className="bg-ink text-paper">
      <p className="wrap py-2 text-center text-[11px] uppercase tracking-luxe">
        {content.announcement}
      </p>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${cormorant.variable} ${jost.variable} h-full`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <AnnouncementBar />
        <Header />
        <main className="flex-1 pb-14 md:pb-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
