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

const SITE_URL = "https://maniagroup.munister.com.ua";
const SITE_NAME = "Mania Group";
const SITE_DESCRIPTION =
  "Інтернет-магазин оригінального брендового одягу, взуття та аксесуарів: EA7 Emporio Armani, Moschino, Antony Morato, MC2 Saint Barth, Harmont & Blaine та інші. Доставка Новою Поштою по всій Україні.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — брендовий одяг, взуття та аксесуари`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "брендовий одяг",
    "інтернет-магазин одягу",
    "EA7 Emporio Armani",
    "Moschino",
    "Antony Morato",
    "MC2 Saint Barth",
    "Harmont & Blaine",
    "оригінальний одяг Україна",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — брендовий одяг, взуття та аксесуари`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/images/hero.webp", width: 1200, height: 800, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — брендовий одяг, взуття та аксесуари`,
    description: SITE_DESCRIPTION,
    images: ["/images/hero.webp"],
  },
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ClothingStore",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.ico`,
  image: `${SITE_URL}/images/hero.webp`,
  telephone: "+380963436035",
  description: SITE_DESCRIPTION,
  address: { "@type": "PostalAddress", addressCountry: "UA" },
  sameAs: ["https://instagram.com/maniagroup.ua", "https://t.me/maniagroup_ua"],
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <AnnouncementBar />
        <Header />
        <main className="flex-1 pb-14 md:pb-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
