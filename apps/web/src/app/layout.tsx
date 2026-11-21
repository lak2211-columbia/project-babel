import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { UrlSearchBridge } from "@/lib/use-url-search";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://project-babel.com";
const SITE_DESCRIPTION =
  "Measuring what five governments require of AI — and why they say those rules are necessary. An evidence-backed comparative observatory across the US, EU, South Korea, Japan, and China.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Project Babel · AI Governance Observatory",
    template: "%s · Project Babel",
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Project Babel",
    title: "Project Babel · AI Governance Observatory",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Project Babel · AI Governance Observatory",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#0a0f18] font-sans text-[#cdd6e1]">
        {children}
        <Suspense fallback={null}>
          <UrlSearchBridge />
        </Suspense>
      </body>
    </html>
  );
}
