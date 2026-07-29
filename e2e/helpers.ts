import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Suppresses the onboarding overlay by seeding the localStorage flag the
 * tutorial reads at boot. Must be called before `page.goto`.
 */
export const dismissTutorial = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("tutorialStatus", "completed");
  });
};

/**
 * Freezes the simulation clock before the app's module graph evaluates
 * so visual-diff screenshots capture a byte-stable frame across runs.
 * Read by the test-hook block at the bottom of `src/store.ts`. Must be
 * called before `page.goto` (`addInitScript` queues the snippet so
 * Playwright re-runs it on every navigation in this context).
 */
export const freezeSimulation = async (page: Page) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __ATLAS_TEST_FREEZE__: boolean }
    ).__ATLAS_TEST_FREEZE__ = true;
  });
};

/**
 * Captures a page screenshot with retries. The HDR postprocess pipeline
 * on the ultra tier occasionally
 * tripped Chromium's `Page.captureScreenshot` protocol with "Unable
 * to capture screenshot" even after a multi-second settle — the
 * failure is not deterministic, and a second attempt a couple seconds
 * later reliably succeeds. We prefer that over loosening the gate to
 * a worthless tolerance.
 */
export const screenshotWithRetry = async (
  page: Page,
  options: Parameters<Page["screenshot"]>[0] = {}
): Promise<Buffer> => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await page.screenshot(options);
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(2000);
    }
  }
  throw lastErr;
};

/**
 * Poll until two screenshots taken `intervalMs` apart differ in fewer
 * than `tolerance` of their pixels, then return the settled frame.
 *
 * The camera intro hands over to damped `OrbitControls`, so the scene
 * converges asymptotically and the time it takes depends on the build,
 * the machine and the GPU. A fixed `waitForTimeout` therefore encodes
 * one machine's timing as a constant, which is what made the boot pixel
 * gate flaky the moment the star field got dense enough for a
 * mid-settle camera to matter (measured: 16.7 % of pixels differing
 * across boots at +4 s, and a production build settles on a different
 * schedule from the dev server).
 *
 * Two things this deliberately does NOT do. It does not require
 * bit-exact stability, because `LightGlow` animates on the wall clock
 * and never fully settles — its floor is ~0.01 % of pixels, two orders
 * of magnitude under any useful tolerance. And it does not fail when
 * the ceiling is reached: it returns the last frame so the CALLER's
 * assertion is what reports the problem, with a real image diff
 * attached, rather than a timeout that says nothing about what the
 * scene looked like.
 */
export const waitForStableFrame = async (
  page: Page,
  {
    intervalMs = 750,
    maxWaitMs = 20_000,
    tolerance = 0.002,
  }: { intervalMs?: number; maxWaitMs?: number; tolerance?: number } = {}
): Promise<Buffer> => {
  const changedFraction = async (a: Buffer, b: Buffer): Promise<number> => {
    const left = await sharp(a).raw().toBuffer({ resolveWithObject: true });
    const right = await sharp(b).raw().toBuffer();
    let changed = 0;
    for (let i = 0; i < left.data.length; i += left.info.channels) {
      if (
        Math.abs(left.data[i] - right[i]) > 8 ||
        Math.abs(left.data[i + 1] - right[i + 1]) > 8 ||
        Math.abs(left.data[i + 2] - right[i + 2]) > 8
      ) {
        changed++;
      }
    }
    return changed / (left.info.width * left.info.height);
  };

  const deadline = Date.now() + maxWaitMs;
  let previous = await screenshotWithRetry(page, { animations: "disabled" });
  let latest = previous;

  while (Date.now() < deadline) {
    await page.waitForTimeout(intervalMs);
    latest = await screenshotWithRetry(page, { animations: "disabled" });
    if ((await changedFraction(previous, latest)) <= tolerance) {
      return latest;
    }
    previous = latest;
  }

  return latest;
};

/**
 * Resolves to `true` when at least one `<canvas>` element exists and has
 * been sized (width and height > 10) — the cheapest visible proof that the
 * three.js renderer has mounted a real framebuffer.
 */
export const pageHasSizedCanvas = async (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("canvas")).filter(
      (node): node is HTMLCanvasElement => node instanceof HTMLCanvasElement
    );

    if (canvases.length === 0) {
      return false;
    }

    return canvases.some((canvas) => canvas.width > 10 && canvas.height > 10);
  });

/**
 * Fraction (0–1) of a central screen crop whose pixels are brighter than
 * near-black. Proves the WebGL canvas is actually being DRAWN, which no
 * other gate covers: `data-postprocessing`, the ready latch and the boot
 * watchdog all pass happily while the renderer issues no draw call at
 * all (see `DirectRenderPass` in `Scene.tsx` for how that happened).
 *
 * `gl.readPixels` cannot answer this — after the frame is composited the
 * drawing buffer is cleared, so it returns zeros on EVERY tier including
 * working ones. A page screenshot is the only honest reading.
 *
 * The crop excludes the top bar, the bottom playback bar and the right
 * rail so only scene pixels are counted. Reference readings on a 1440×900
 * viewport: ~4.3 % on `constrained`, ~7.1 % on `ultra`, and ~0.2 % when
 * nothing renders (the HTML overlay icon rings float over a black
 * canvas and are all that survives).
 */
export const canvasLitFraction = async (page: Page): Promise<number> => {
  const shot = await page.screenshot({
    clip: { x: 200, y: 150, width: 1040, height: 670 },
  });
  const { data, info } = await sharp(shot)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let lit = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.max(data[i], data[i + 1], data[i + 2]) >= 16) lit++;
  }

  return lit / (info.width * info.height);
};

/**
 * Navigates to the preview root and waits for the Atlas shell to finish
 * booting: the top bar heading renders and the WebGL canvas reports a
 * non-zero size.
 */
export const visitAtlasAndWaitForReady = async (page: Page) => {
  await dismissTutorial(page);
  await page.goto("/atlas-orbital/", { waitUntil: "domcontentloaded" });

  const topBarHeading = page
    .locator('[data-ui-framing="top-bar"]')
    .getByRole("heading", { name: "ATLAS ORBITAL" });
  await expect(topBarHeading).toBeVisible({ timeout: 45_000 });

  await expect
    .poll(async () => pageHasSizedCanvas(page), { timeout: 20_000 })
    .toBe(true);
};
