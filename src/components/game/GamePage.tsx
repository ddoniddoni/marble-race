import Link from "next/link";
import GameClient from "./GameClient";
import { absoluteUrl, siteDescription, siteName } from "@/lib/site";

export default function GamePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": absoluteUrl("#game"),
    name: siteName,
    alternateName: "MARBLE RUN",
    description: siteDescription,
    url: absoluteUrl(),
    image: absoluteUrl("social-card.png"),
    applicationCategory: "GameApplication",
    operatingSystem: "Web browser",
    inLanguage: "ko",
    isAccessibleForFree: true,
  };
  return (
    <>
      <GameClient />
      <section id="about" className="game-about" aria-labelledby="about-heading">
        <p className="guide-eyebrow">구슬 유원지 · MARBLE RUN</p>
        <h1 id="about-heading">이름을 넣고 즐기는 온라인 구슬 레이스</h1>
        <p>{siteDescription}</p>
        <p>참가자 이름을 쉼표나 줄바꿈으로 구분해 입력하고, 코스를 고른 뒤 시작하세요.
          구슬이 장애물을 통과하는 모습을 따라가며 오른쪽 현황판에서 완주 순위를 볼 수 있습니다.</p>
        <nav aria-label="게임 안내">
          <Link href="/guide/">구슬 레이스 이용 안내와 자주 묻는 질문 →</Link>
          <a href="#">게임 화면으로 ↑</a>
        </nav>
        <noscript><p>게임을 실행하려면 JavaScript를 켜 주세요. 이용 안내는 JavaScript 없이도 읽을 수 있습니다.</p></noscript>
      </section>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    </>
  );
}
