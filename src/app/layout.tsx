import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "구슬 유원지 · MARBLE RUN",
  description: "이름과 번호를 넣고, 전체 화면에서 구슬을 따라가는 물리 놀이터",
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
