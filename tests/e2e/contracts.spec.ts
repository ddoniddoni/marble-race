import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./helpers";
import { TEMPLATES } from "../../src/game/templates";
import { serializeMap, hashMap } from "../../src/game/contracts/canonical";
async function ready(page: Page, id: string) {
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().sceneId))
    .toBe(id);
  await expect(page.locator("canvas")).toHaveCount(1);
}
test("three original maps load the canonical hash and simulate without leaking", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/play?debug=1");
  for (const template of TEMPLATES) {
    await page
      .getByRole("button", { name: new RegExp(template.title) })
      .click();
    await ready(page, template.id);
    expect(
      await page.evaluate(() => window.__MARBLE_POC__!.read().mapHash),
    ).toBe(await hashMap(template.map));
    await page.getByRole("button", { name: "시작", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().tick))
      .toBeGreaterThan(25);
    const state = await page.evaluate(() => window.__MARBLE_POC__!.read());
    expect(state.resources.worlds).toBe(1);
    expect(state.bodies).toBe(20 + template.map.objects.length);
    expect(state.poses[0]!.y).toBeGreaterThan(1.5);
    await openSettings(page);
    await page
      .locator(".scene-options")
      .getByRole("button", { name: /100개/ })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().count))
      .toBe(100);
    expect(
      await page.evaluate(() => window.__MARBLE_POC__!.resources().worlds),
    ).toBe(1);
    await page
      .locator(".scene-options")
      .getByRole("button", { name: /20개/ })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().count))
      .toBe(20);
  }
  expect(errors).toEqual([]);
});
test("JSON validation reports fields, rejects future version and export/import preserves hash", async ({
  page,
}) => {
  await page.goto("/play?debug=1");
  await ready(page, TEMPLATES[0]!.id);
  await page.locator(".contract-panel > summary").click();
  const input = page.getByLabel("맵 문서", { exact: true });
  const original = await input.inputValue();
  await input.fill(JSON.stringify({ ...TEMPLATES[0]!.map, schemaVersion: 2 }));
  await page.getByRole("button", { name: "검증·정규화" }).click();
  await expect(page.locator(".contract-errors[role=alert]")).toContainText(
    "schemaVersion",
  );
  await expect(page.locator(".contract-errors[role=alert]")).toContainText(
    "지원하지 않는 맵 버전",
  );
  await input.fill(original);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 내보내기" }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toBe(
    serializeMap(TEMPLATES[0]!.map),
  );
  await page.getByRole("button", { name: "장면으로 열기" }).click();
  await ready(page, "imported-map");
  expect(await page.evaluate(() => window.__MARBLE_POC__!.read().mapHash)).toBe(
    await hashMap(TEMPLATES[0]!.map),
  );
});
test("contract-valid P2 motion is clearly marked unsupported without destroying the scene", async ({
  page,
}) => {
  await page.goto("/play?debug=1");
  await ready(page, TEMPLATES[0]!.id);
  await page.locator(".contract-panel > summary").click();
  const map = structuredClone(TEMPLATES[0]!.map);
  map.objects = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      kind: "moving-platform",
      color: "#FFFFFF",
      transform: { x: 10, y: 12, rotation: 0 },
      end: { x: 14, y: 12 },
      width: 4,
      height: 0.3,
      periodTicks: 120,
      phaseTicks: 0,
    },
  ];
  await page.getByLabel("맵 문서", { exact: true }).fill(JSON.stringify(map));
  await page.getByRole("button", { name: "장면으로 열기" }).click();
  await expect(page.locator(".contract-status")).toContainText("P2에서 지원");
  expect(await page.evaluate(() => window.__MARBLE_POC__!.read().sceneId)).toBe(
    TEMPLATES[0]!.id,
  );
});
test("fullscreen stage fits desktop/mobile and reduced-motion layouts", async ({
  page,
}) => {
  await page.goto("/play?debug=1");
  await ready(page, TEMPLATES[0]!.id);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().tick))
    .toBeGreaterThan(120);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.screenshot({
    path: `test-results/p1-desktop-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "재개", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `test-results/p1-mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
});
