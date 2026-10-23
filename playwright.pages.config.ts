import { defineConfig, devices } from "@playwright/test";
import { readSiteUrl } from "./src/lib/site";

const baseURL = `http://127.0.0.1:3101${readSiteUrl().pathname}`;
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "pages.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node scripts/serve-pages.mjs", url: baseURL, reuseExistingServer: false },
});
