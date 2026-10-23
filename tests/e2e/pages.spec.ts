import { expect, test } from "@playwright/test";
import { absoluteUrl, readSiteUrl } from "../../src/lib/site";

const mount = readSiteUrl().pathname;

test("exported metadata, sitemap and real 404 responses", async ({ request }) => {
  for (const path of ["", "play/"]) {
    const response = await request.get(`./${path}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<link rel="canonical" href="${absoluteUrl()}"`);
    expect(html).toContain('lang="ko"');
    expect(html).toContain("이름을 넣고 즐기는 온라인 구슬 레이스");
    expect(html).toContain(`href="${mount}guide/"`);
    expect(html).toContain('content="index, follow"');
    expect(html).toContain(`content="${absoluteUrl("social-card.png")}"`);
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
    expect(JSON.parse(json!)).toMatchObject({ "@type": "WebApplication", url: absoluteUrl() });
  }
  const sitemap = await (await request.get("./sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${absoluteUrl()}</loc>`);
  expect(sitemap).toContain(`<loc>${absoluteUrl("guide/")}</loc>`);
  expect(sitemap).not.toContain("/play/");
  expect(sitemap).not.toContain("localhost");
  const robots = await (await request.get("./robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${absoluteUrl("sitemap.xml")}`);
  expect((await request.get("./social-card.png")).headers()["content-type"]).toBe("image/png");
  expect((await request.get("./icon.svg")).status()).toBe(200);
  expect((await request.get("./not-a-real-page/")).status()).toBe(404);
});

test("game assets load under the repository path and guide links work", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.url().startsWith("http://127.0.0.1:3101") && response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("./?debug=1");
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count)).toBe(6);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().tick)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.getByRole("link", { name: "이용 안내 ↓" }).click();
  await page.getByRole("link", { name: "구슬 레이스 이용 안내와 자주 묻는 질문 →" }).click();
  await expect(page).toHaveURL(new RegExp(`${mount}guide/$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("구슬 레이스, 이렇게 즐겨요.");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", absoluteUrl("guide/"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "구슬 레이스 시작하기 →" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("readable without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("public content and guide navigation are in the initial HTML", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Playwright's text selector skips noscript; inspect its parsed child directly.
    await expect(page.locator("noscript p")).toBeVisible();
    await expect(page.locator("noscript p")).toContainText("게임을 실행하려면 JavaScript를 켜 주세요.");
    await page.getByRole("link", { name: "구슬 레이스 이용 안내와 자주 묻는 질문 →" }).click();
    await expect(page.getByRole("heading", { name: "자주 묻는 질문" })).toBeVisible();
    await expect(page.getByText("현재는 기본 코스 플레이와 참가자 설정을 제공합니다.", { exact: false })).toBeVisible();
  });
});
