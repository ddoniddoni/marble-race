import type { Metadata } from "next";
import { pageMetadata, siteDescription, siteUrl } from "@/lib/site";
import "./globals.css";
export const metadata: Metadata = {
  ...pageMetadata("구슬 유원지 — 무료 온라인 구슬 레이스", siteDescription),
  metadataBase: siteUrl,
  robots: { index: true, follow: true },
  icons: { icon: `${process.env.PAGES_EXPORT === "1" ? siteUrl.pathname.replace(/\/$/, "") : ""}/icon.svg` },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: {
      ...(process.env.NAVER_SITE_VERIFICATION ? { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } : {}),
      ...(process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : {}),
    },
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
