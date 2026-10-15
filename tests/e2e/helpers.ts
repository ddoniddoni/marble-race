import type { Page } from "@playwright/test";
export async function openSettings(page: Page) {
  const toggle = page.locator(".settings-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
}
