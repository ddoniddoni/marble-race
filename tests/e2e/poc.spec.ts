import { expect, test, type Page } from "@playwright/test";
import type { DebugBridge } from "../../src/game/runtime/GameRuntime";
declare global {
  interface Window {
    __resourceRead?: DebugBridge["resources"];
  }
}
async function ready(page: Page, count = 20) {
  await expect
    .poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count))
    .toBe(count);
  await expect(page.locator("canvas")).toHaveCount(1);
}
async function read(page: Page) {
  return page.evaluate(() => window.__MARBLE_POC__!.read());
}

async function openPoc(page: Page) {
  await page.goto("/play?debug=1");
  await ready(page, 6);
  await page.locator(".tools-panel > summary").click();
  await page.getByRole("button", { name: "P0 계측 장면 선택" }).click();
  await expect
    .poll(async () => (await read(page)).sceneId)
    .toBe("p0-20-contract-v1");
}

test("production WebGL + embedded WASM load; physics moves, pauses and resets", async ({
  page,
}) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => failures.push(r.url()));
  await openPoc(page);
  await ready(page);
  const initial = await read(page);
  expect(initial.tickerStarted).toBe(false);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect.poll(async () => (await read(page)).tick).toBeGreaterThan(30);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const paused = await read(page);
  expect(paused.poses[0]!.y).toBeGreaterThan(initial.poses[0]!.y);
  // Deliberate stability window: verify absence of ticks while paused.
  await page.waitForTimeout(300);
  expect((await read(page)).poses).toEqual(paused.poses);
  expect((await read(page)).tick).toBe(paused.tick);
  await page.getByRole("button", { name: "처음으로", exact: true }).click();
  expect((await read(page)).poses).toEqual(initial.poses);
  expect((await read(page)).tick).toBe(0);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("20 stress resets and 20 game route round trips keep one engine", async ({
  page,
}) => {
  await openPoc(page);
  await ready(page);
  await page
    .locator(".scene-options")
    .getByRole("button", { name: /100개/ })
    .click();
  await ready(page, 100);
  const baseline = (await read(page)).resources;
  expect(baseline).toEqual({
    runtimes: 1,
    rafs: 1,
    listeners: 10,
    worlds: 1,
    bodies: 320,
    colliders: 320,
    renderers: 1,
    observers: 1,
  });
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "처음으로", exact: true }).click();
    expect((await read(page)).resources).toEqual(baseline);
  }
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      window.__resourceRead = window.__MARBLE_POC__!.resources;
    });
    await page.getByRole("link", { name: "구슬 유원지", exact: true }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => window.__resourceRead!()))
      .toMatchObject({
        runtimes: 1,
        rafs: 1,
        listeners: 10,
        worlds: 1,
        renderers: 1,
        observers: 1,
      });
    await page.goBack();
    await ready(page, 6);
  }
});

test("rapid scene replacement, measurement cancellation and mobile layout", async ({
  page,
}) => {
  await openPoc(page);
  await ready(page);
  for (let i = 0; i < 8; i++) {
    await page
      .locator(".scene-options")
      .getByRole("button", { name: /100개/ })
      .click();
    await page
      .locator(".scene-options")
      .getByRole("button", { name: /20개/ })
      .click();
  }
  await ready(page);
  await expect.poll(async () => (await read(page)).resources.worlds).toBe(1);
  await page.locator(".tools-panel > summary").click();
  await page.getByRole("button", { name: "60초 측정 시작" }).click();
  await expect
    .poll(async () => (await read(page)).measurementSeconds ?? 0)
    .toBeGreaterThan(0.25);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  expect((await read(page)).measurementSeconds).toBeNull();
  expect((await read(page)).results).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("context loss releases engine and offers working retry", async ({
  page,
}) => {
  await openPoc(page);
  await ready(page);
  await page.evaluate(() => {
    window.__resourceRead = window.__MARBLE_POC__!.resources;
    const canvas = document.querySelector("canvas")!;
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  await expect(page.locator('.board-message[role="alert"]')).toBeVisible();
  expect(await page.evaluate(() => window.__resourceRead!().worlds)).toBe(0);
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await ready(page);
});

test("visibility policy pauses without catch-up and requires manual resume", async ({
  page,
}) => {
  await openPoc(page);
  await ready(page);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect.poll(async () => (await read(page)).tick).toBeGreaterThan(10);
  // Deterministic visibility event injection; not a real mobile background test.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const paused = await read(page);
  await page.waitForTimeout(250);
  expect((await read(page)).tick).toBe(paused.tick);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await read(page)).phase).toBe("paused");
  await page.getByRole("button", { name: "재개", exact: true }).click();
  await expect
    .poll(async () => (await read(page)).tick)
    .toBeGreaterThan(paused.tick);
  expect((await read(page)).droppedMs).toBeLessThan(100);
});

test("real WebGL context loss frees the world and can be retried", async ({
  page,
}) => {
  await openPoc(page);
  await ready(page);
  const supported = await page.evaluate(() => {
    window.__resourceRead = window.__MARBLE_POC__!.resources;
    const gl = document.querySelector("canvas")!.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(extension);
  });
  test.skip(
    !supported,
    "WEBGL_lose_context extension unavailable in this browser",
  );
  await expect(page.locator('.board-message[role="alert"]')).toBeVisible();
  expect(await page.evaluate(() => window.__resourceRead!().worlds)).toBe(0);
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await ready(page);
});
