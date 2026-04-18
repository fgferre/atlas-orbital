import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
} from "./helpers";

test.describe("boot", () => {
  // The visual-identity spec below waits ~47 s in the worst case
  // (20 s visitAtlasAndWaitForReady budget + 2 s settle + browser
  // context setup + screenshot comparison). The default 30 s timeout
  // eats context setup alone on cold preview starts.
  test.setTimeout(60_000);

  test("mounts a sized canvas and logs no console errors within 15s", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await visitAtlasAndWaitForReady(page);

    await expect
      .poll(async () => pageHasSizedCanvas(page), { timeout: 15_000 })
      .toBe(true);

    // Atlas never mounts a dismissible splash DOM node — readiness is
    // inferred from the heading + sized canvas gate above. Assert the
    // "Initializing Simulation" loader is no longer on screen.
    await expect(page.getByText("Initializing Simulation")).toHaveCount(0);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  // Wave α smoke gate: screenshot the boot frame with the simulation
  // clock frozen and compare against a committed baseline. Tolerance is
  // set to 1 % (`maxDiffPixelRatio: 0.01`) because R3F's
  // `frameloop="always"` + GPU rasterization non-determinism make
  // tighter pixel-level equality unreliable across runs even on byte-
  // identical render math. The rigorous identity gate for the Wave 0
  // lerp refactor is `visualPresetOverrides.test.ts` — a pure-function
  // equality check, stricter than any pixel-diff. This screenshot only
  // catches gross regressions (a whole planet moves, a color palette
  // collapses, a post-processing effect unmounts).
  //
  // We use `toMatchSnapshot(buffer)` instead of `toHaveScreenshot`
  // because Playwright's built-in stability retry requires bit-exact
  // stability between back-to-back screenshots, which R3F never
  // delivers. `toMatchSnapshot` is a single-shot comparison against
  // the committed baseline; `waitForTimeout` lets the lerp settle.
  //
  // Commit 2's HDR pipeline shift intentionally re-baselines.
  test("boot visual identity (frozen sim)", async ({ page }) => {
    await freezeSimulation(page);
    await visitAtlasAndWaitForReady(page);
    // Let useVisualPresetLerp converge (~60 frames at factor 0.05).
    await page.waitForTimeout(2000);
    const screenshot = await page.screenshot({ animations: "disabled" });
    expect(screenshot).toMatchSnapshot("boot-frozen.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
