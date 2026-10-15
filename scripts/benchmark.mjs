import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const headless = process.env.BENCH_HEADED !== "1";
const browser = await chromium.launch({ headless });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  date: new Date().toISOString(),
  mode: headless
    ? "Playwright Chromium headless"
    : "Playwright Chromium headed",
  browser: browser.version(),
  host: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    memoryGiB: os.totalmem() / 2 ** 30,
  },
  environment: null,
  runs: [],
  errors,
};
try {
  await page.goto(`${baseURL}/play?debug=1`);
  await page.waitForFunction(() => !!window.__MARBLE_POC__);
  await page.locator(".tools-panel > summary").click();
  await page.getByRole("button", { name: "P0 계측 장면 선택" }).click();
  await page.waitForFunction(
    () => window.__MARBLE_POC__?.read().sceneId === "p0-20-contract-v1",
  );
  report.environment = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      glRenderer: info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  for (const count of process.env.BENCH_SCENE === "100" ? [100] : [20, 100]) {
    if (count === 100)
      await page
        .locator(".scene-options")
        .getByRole("button", { name: /100개/ })
        .click();
    await page.waitForFunction(
      (n) => window.__MARBLE_POC__?.read().count === n,
      count,
    );
    await page.locator(".tools-panel > summary").click();
    const repetitions = Number(process.env.BENCH_RUNS ?? 3);
    for (let run = 1; run <= repetitions; run++) {
      console.log(
        `Starting ${count} marbles · run ${run}/${repetitions} · 60 seconds`,
      );
      await page.bringToFront();
      await page.waitForFunction(() => !document.hidden);
      await page.getByRole("button", { name: "60초 측정 시작" }).click();
      await page.waitForFunction(
        (n) => window.__MARBLE_POC__?.read().results.length === n,
        run,
        { timeout: 90_000 },
      );
      const result = await page.evaluate(() =>
        window.__MARBLE_POC__.read().results.at(-1),
      );
      report.runs.push(result);
      console.log(
        JSON.stringify({
          count,
          run,
          fps: result.fps,
          p95: result.p95FrameMs,
          longFrames: result.longFrames,
          awake: result.awake,
        }),
      );
      await mkdir("test-results", { recursive: true });
      await writeFile(
        "test-results/benchmark.json",
        JSON.stringify(report, null, 2),
      );
    }
  }
  await page
    .locator(".scene-options")
    .getByRole("button", { name: /20개/ })
    .click();
  await page.waitForFunction(() => window.__MARBLE_POC__?.read().count === 20);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await page.waitForFunction(() => window.__MARBLE_POC__?.read().tick > 145);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
} catch (error) {
  // A closed tab cannot be inspected. Preserve the original failure in that case.
  console.error("Benchmark failed:", error);
  if (!page.isClosed()) {
    const diagnostics = await page
      .evaluate(() => ({
        visibility: document.visibilityState,
        diagnostics: window.__MARBLE_POC__?.read(),
        text: document.body.innerText,
      }))
      .catch(() => null);
    console.error(JSON.stringify(diagnostics, null, 2));
    await page
      .screenshot({
        path: "test-results/benchmark-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
