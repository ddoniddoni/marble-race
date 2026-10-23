import { expect, test } from "@playwright/test";

test("last-stage collision pops, pauses and resets without restoring the air lift", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Reproduce a real observed race without changing the product's seed selection.
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", { value: (array: Uint8Array | Uint32Array) => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 2163800664;
        return array;
      }
      return original(array);
    } });
  });
  await page.goto("/play?debug=1");
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count)).toBe(6);
  await page.getByRole("button", { name: "20개 가볍게 굴리기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count)).toBe(20);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  const event = await page.waitForFunction(() => {
    const state = window.__MARBLE_POC__!.read();
    const burst = state.collisionBursts.at(-1);
    return burst ? { ...burst, startY: state.collisionPop!.startY, air: state.finishAir,
      slowMotion: state.race!.slowMotion } : false;
  }, undefined, { timeout: 65_000 });
  const burst = await event.jsonValue();
  expect(burst).toBeTruthy();
  if (!burst) throw new Error("충돌 팝 이벤트가 없습니다.");
  expect(burst.y).toBeGreaterThanOrEqual(burst.startY);
  expect(burst.a).not.toBe(burst.b);
  expect(burst.air).toBeNull();
  expect(burst.slowMotion).toBe(false);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  const paused = await page.evaluate(() => window.__MARBLE_POC__!.read());
  // A stability window verifies that neither charges nor effects advance while paused.
  await page.waitForTimeout(300);
  const still = await page.evaluate(() => window.__MARBLE_POC__!.read());
  expect(still.tick).toBe(paused.tick);
  expect(still.flowStats?.collisionPops).toBe(paused.flowStats?.collisionPops);
  expect(still.poses).toEqual(paused.poses);
  await page.getByRole("button", { name: "새로 섞기", exact: true }).click();
  const reset = await page.evaluate(() => window.__MARBLE_POC__!.read());
  expect(reset.tick).toBe(0);
  expect(reset.collisionBursts).toEqual([]);
  expect(reset.flowStats?.collisionPops).toBe(0);
  expect(reset.resources).toMatchObject({ runtimes: 1, worlds: 1, renderers: 1, rafs: 1 });
  expect(errors).toEqual([]);
});
