import { expect, type Page } from "@playwright/test";

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
