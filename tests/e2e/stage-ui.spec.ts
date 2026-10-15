import { expect, test } from "@playwright/test";
import { openSettings } from "./helpers";
test("settings fold on start, return without restarting, and zoom stays presentation-only", async ({
  page,
}) => {
  await page.goto("/play?debug=1");
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().phase))
    .toBe("ready");
  const initialHeight = (await page.locator("canvas").boundingBox())!.height;
  await page
    .getByLabel("이름 · 숫자 · 짧은 문구", { exact: true })
    .fill("민수\n지영\n001\n행운 7");
  await page.getByRole("button", { name: "구슬에 적용", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count))
    .toBe(4);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".settings-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator("#play-settings")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().tick))
    .toBeGreaterThan(120);
  expect((await page.locator("canvas").boundingBox())!.height).toBeGreaterThan(
    initialHeight,
  );
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const before = await page.evaluate(() => window.__MARBLE_POC__!.read());
  await page.getByRole("button", { name: "화면 확대", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().camera.zoom))
    .toBe(1.25);
  expect(
    await page.evaluate(() => window.__MARBLE_POC__!.read().poses),
  ).toEqual(before.poses);
  await openSettings(page);
  await expect(
    page.getByLabel("이름 · 숫자 · 짧은 문구", { exact: true }),
  ).toHaveValue("민수\n지영\n001\n행운 7");
  expect(await page.evaluate(() => window.__MARBLE_POC__!.read().tick)).toBe(
    before.tick,
  );
  expect(
    await page.evaluate(() => window.__MARBLE_POC__!.resources().worlds),
  ).toBe(1);
  await page.screenshot({
    path: `test-results/studio-settings-${test.info().project.name}.png`,
  });
  const expandedViewHeight = await page.evaluate(
    () => window.__MARBLE_POC__!.read().camera.visibleHeight,
  );
  await page.getByRole("button", { name: "설정 접기", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__MARBLE_POC__!.read().camera.visibleHeight),
    )
    .toBeGreaterThan(expandedViewHeight);
  expect(
    await page.evaluate(() => window.__MARBLE_POC__!.read().poses),
  ).toEqual(before.poses);
  await page.screenshot({
    path: `test-results/studio-play-${test.info().project.name}.png`,
  });
});
test("mobile settings, start and pause remain reachable within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play?debug=1");
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().phase))
    .toBe("ready");
  await page
    .getByLabel("이름 · 숫자 · 짧은 문구", { exact: true })
    .fill("001,지영,행운 7");
  await page.getByRole("button", { name: "구슬에 적용", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count))
    .toBe(3);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__!.read().tick))
    .toBeGreaterThan(90);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const box = (await page
      .getByRole("button", { name: "재개", exact: true })
      .boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/studio-mobile-${width}-${test.info().project.name}.png`,
    });
  }
  await openSettings(page);
  await expect(
    page.getByLabel("이름 · 숫자 · 짧은 문구", { exact: true }),
  ).toHaveValue("001,지영,행운 7");
  await page.getByRole("button", { name: /홍련 범퍼/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().sceneId))
    .toBe("bloom-bumper-v2");
  expect(
    await page.evaluate(() => window.__MARBLE_POC__!.read().participantNames),
  ).toEqual(["001", "지영", "행운 7"]);
});
