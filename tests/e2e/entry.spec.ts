import { expect, test, type Page } from "@playwright/test";

async function loaded(page: Page, count = 6) {
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().count)).toBe(count);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__MARBLE_POC__?.read().resources.worlds)).toBe(1);
  await expect(page.locator('.board-message[role="alert"]')).toHaveCount(0);
}

test("root opens the game directly and preserves play/brand navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?debug=1");
  await loaded(page);
  await expect(page.locator(".welcome")).toHaveCount(0);
  await page.reload();
  await loaded(page);
  await page.goto("/play?debug=1");
  await loaded(page);
  await page.getByRole("link", { name: "구슬 유원지", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".board-message")).toHaveCount(0);
  await expect(page.locator(".welcome")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("live multiplier edits preserve focus and replace one runtime as counts change", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?debug=1");
  await loaded(page);
  const input = page.locator("#participant-names");
  await input.fill("민수*1000\n지영*1000");
  await loaded(page, 2000);
  await expect(input).toBeFocused();
  await input.press("End");
  await input.press("Backspace");
  await loaded(page, 1100);
  await expect(input).toBeFocused();
  const names = await page.evaluate(() => window.__MARBLE_POC__!.read().participantNames);
  expect(names.filter((name) => name === "민수")).toHaveLength(1000);
  expect(names.filter((name) => name === "지영")).toHaveLength(100);
  await input.fill("민수\n지영");
  await loaded(page, 2);
  await expect(input).toBeFocused();
  expect(errors).toEqual([]);
});
