import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getSiteContent, announcementActive } from "@/lib/siteContent";
import { dbBrands } from "@/lib/productSource";

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

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteContent();
  const ogImg = seo.ogImage || "/images/hero.webp";
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: seo.defaultTitle,
      template: seo.titleTemplate,
    },
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "uk_UA",
      siteName: seo.siteName,
      title: seo.defaultTitle,
      description: seo.description,
      url: SITE_URL,
      images: [{ url: ogImg, width: 1200, height: 800, alt: seo.siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.defaultTitle,
      description: seo.description,
      images: [ogImg],
    },
  };
}

async function orgJsonLd() {
  const { seo, contacts } = await getSiteContent();
  const sameAs = [contacts.instagram, contacts.telegram, contacts.facebook].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: seo.siteName,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.ico`,
    image: `${SITE_URL}${seo.ogImage || "/images/hero.webp"}`,
    telephone: contacts.phone.replace(/[^\d+]/g, "") || "+380963436035",
    description: seo.description,
    address: { "@type": "PostalAddress", addressCountry: "UA" },
    sameAs: sameAs.length ? sameAs : ["https://instagram.com/maniagroup.ua", "https://t.me/maniagroup_ua"],
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/catalog?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

async function AnnouncementBar() {
  const content = await getSiteContent();
  if (!announcementActive(content)) return null;
  return (
    <div className="bg-ink text-paper">
      <p className="wrap py-2 text-center text-[11px] uppercase tracking-luxe">
        {content.announcement}
      </p>
    </div>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = await orgJsonLd();
  let brands: { name: string; slug: string }[] = [];
  try { brands = await dbBrands(); } catch { brands = []; }
  return (
    <html
      lang="uk"
      className={`${cormorant.variable} ${jost.variable} h-full`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AnnouncementBar />
        <Header brands={brands} />
        <main className="flex-1 pb-14 md:pb-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
