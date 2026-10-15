import { test, expect, type Page } from "@playwright/test";
import { openSettings } from "./helpers";
import { TEMPLATES } from "../../src/game/templates";
async function state(page: Page) {
  return page.evaluate(() => window.__MARBLE_POC__!.read());
}
async function ready(page: Page) {
  await page.goto("/play?debug=1");
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().phase))
    .toBe("ready");
}
test("custom names/numbers determine the actual marble count and survive course changes/reset", async ({
  page,
}) => {
  await ready(page);
  await page
    .getByLabel("이름 · 숫자 · 짧은 문구", { exact: true })
    .fill("민수,001\n행운 7\n민수");
  await page.getByRole("button", { name: "구슬에 적용", exact: true }).click();
  await expect.poll(async () => (await state(page)).count).toBe(4);
  expect((await state(page)).participantNames).toEqual([
    "민수",
    "001",
    "행운 7",
    "민수",
  ]);
  const initial = (await state(page)).poses;
  expect((await state(page)).bodies).toBe(TEMPLATES[0]!.map.objects.length + 4);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(30);
  await page.getByRole("button", { name: "처음으로", exact: true }).click();
  expect((await state(page)).poses).toEqual(initial);
  await openSettings(page);
  await page.getByRole("button", { name: /홍련 범퍼/ }).click();
  await expect
    .poll(async () => (await state(page)).sceneId)
    .toBe(TEMPLATES[1]!.id);
  expect((await state(page)).participantNames).toEqual([
    "민수",
    "001",
    "행운 7",
    "민수",
  ]);
  await expect(
    page.getByLabel("이름 · 숫자 · 짧은 문구", { exact: true }),
  ).toHaveValue("민수,001\n행운 7\n민수");
  expect((await state(page)).resources.worlds).toBe(1);
});
test("invalid entries preserve the active scene and continuous numbering can fill 100 marbles", async ({
  page,
}) => {
  await ready(page);
  for (const text of ["하나", "정상\n<script>alert(1)</script>"]) {
    await page
      .getByLabel("이름 · 숫자 · 짧은 문구", { exact: true })
      .fill(text);
    await page
      .getByRole("button", { name: "구슬에 적용", exact: true })
      .click();
    await expect(page.locator(".participant-error")).toBeVisible();
    expect((await state(page)).count).toBe(20);
  }
  await page.locator(".number-generator > summary").click();
  await page.getByLabel("시작 번호", { exact: true }).fill("101");
  await page.getByLabel("구슬 수", { exact: true }).fill("100");
  await page.getByRole("button", { name: "번호 채우기", exact: true }).click();
  await page.getByRole("button", { name: "구슬에 적용", exact: true }).click();
  await expect.poll(async () => (await state(page)).count).toBe(100);
  expect((await state(page)).participantNames[0]).toBe("101");
  expect((await state(page)).participantNames.at(-1)).toBe("200");
  await page.getByRole("button", { name: "이름 표시", exact: true }).click();
  await page.getByRole("button", { name: /100개 가득 채워/ }).click();
  await expect
    .poll(async () => (await state(page)).participantNames[0])
    .toBe("1");
  await expect(
    page.getByRole("button", { name: "이름 표시", exact: true }),
  ).toBeVisible();
  expect((await state(page)).resources.worlds).toBe(1);
});
test("long-course camera follows, overview does not change physics and reset restores the top", async ({
  page,
}) => {
  await ready(page);
  const map = structuredClone(TEMPLATES[0]!.map);
  map.objects = map.objects.slice(0, 4);
  await page.locator(".contract-panel > summary").click();
  await page.getByLabel("맵 문서", { exact: true }).fill(JSON.stringify(map));
  await page
    .getByRole("button", { name: "장면으로 열기", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).sceneId)
    .toBe("imported-map");
  expect((await state(page)).camera.worldHeight).toBe(72);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).camera.top, { timeout: 15000 })
    .toBeGreaterThan(2);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const poses = (await state(page)).poses;
  await page
    .getByRole("button", { name: "전체 코스 보기", exact: true })
    .click();
  expect((await state(page)).camera.visibleHeight).toBe(72);
  expect((await state(page)).poses).toEqual(poses);
  await page
    .getByRole("button", { name: "구슬 따라가기", exact: true })
    .click();
  await page.getByRole("button", { name: "처음으로", exact: true }).click();
  expect((await state(page)).camera.top).toBe(0);
  expect((await state(page)).tick).toBe(0);
});
