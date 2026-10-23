import type { Metadata } from "next";

export const siteName = "구슬 유원지";
export const siteDescription =
  "이름이나 번호를 넣고 즐기는 무료 온라인 구슬 레이스 게임. 설치와 로그인 없이 코스를 선택하고, 구슬의 움직임과 완주 순위를 확인하세요.";

// A single public URL supplies canonical URLs and the Pages mount path.
export function readSiteUrl(value = process.env.SITE_URL || "https://ddoniddoni.github.io/marble-race/") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*$/.test(url.pathname)) {
    throw new Error("SITE_URL은 경로를 포함할 수 있는 공개 HTTPS 주소여야 합니다. 쿼리·해시·인증 정보는 사용할 수 없습니다.");
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
  return url;
}

export const siteUrl = readSiteUrl();
export const absoluteUrl = (path = "") => new URL(path.replace(/^\//, ""), siteUrl).href;

export function pageMetadata(title: string, description: string, path = ""): Metadata {
  const url = absoluteUrl(path);
  const images = [{ url: absoluteUrl("social-card.png"), width: 1200, height: 630,
    alt: "구슬 유원지 MARBLE RUN — 온라인 구슬 레이스" }];
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "ko_KR", siteName, title, description, url, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
