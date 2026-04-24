import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  screenshotWithRetry,
  visitAtlasAndWaitForReady,
} from "./helpers";

test.describe("boot", () => {
  // The visual-identity spec below waits ~75 s in the worst case
  // (20 s visitAtlasAndWaitForReady budget + 45 s atlas-loader exit
  // budget + 1 s lerp settle + browser context setup + screenshot
  // comparison). T5.6 diag (2026-04-24): the loader takes ~30 s to
  // reach 100 % in the Playwright prod-preview env (vs ~6 s in dev).
  // 45 s timeout leaves 15 s headroom over the observed duration.
  // Longer-term fix tracked as T5.7 (separate ticket): investigate
  // why critical-assets resolution is 4-5× slower in prod preview
  // than in dev.
  test.setTimeout(90_000);

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
  // the committed baseline; the wait chain below lets the scene
  // settle into a deterministic post-boot state.
  //
  // **T5.6 (2026-04-24)** — pre-T5.6 this used a flat
  // `waitForTimeout(3500)` which captured mid-loader on current HEAD
  // (the loader takes longer to exit after T5.1/T5.2/T5.3b shader
  // compiles + T4.4 grid shader compile + SurfaceModeFirstPerson
  // mount). The baseline and the actual render ended up at different
  // boot phases → 88 % pixel diff on a correctly-behaving scene.
  // Replaced the flat timeout with a deterministic wait chain:
  //   1. Loader exits (`"Initializing Simulation"` text gone, same
  //      gate as the sibling "no console errors" test at :39).
  //   2. Intro animation settles — `INTRO_DURATION_MS = 12000` in
  //      `InitialCameraAnimation.tsx:11`, so a 13 s ceiling on the
  //      loader-exit poll gives headroom.
  //   3. `waitForTimeout(1000)` for post-intro lerp settle (replaces
  //      the pre-T5.6 3500 ms flat wait — intro finishes before the
  //      loader hides, so only the lerp tail matters after exit).
  test("boot visual identity (frozen sim)", async ({ page }) => {
    await freezeSimulation(page);
    await visitAtlasAndWaitForReady(page);
    // Wait for the full-screen loader overlay (`Loader.tsx`
    // `<motion.div data-testid="atlas-loader">`) to be removed from
    // the DOM. `AnimatePresence` unmounts it after the 1 s exit
    // animation once `isLoaderHidden` flips true (i.e., after
    // critical-assets gate + scene-ready signal). Give 15 s headroom
    // to cover the 12 s `INTRO_DURATION_MS` + the 1 s exit animation
    // + the `SceneReadyChecker` safety-hatch ceiling at 8 s.
    await expect(page.getByTestId("atlas-loader")).toHaveCount(0, {
      timeout: 45_000,
    });
    // Post-loader lerp settle. 1 s covers the useVisualPresetLerp
    // convergence tail; the prior 3.5 s flat wait was also picking up
    // the loader window, which is no longer necessary.
    await page.waitForTimeout(1000);
    const screenshot = await screenshotWithRetry(page, {
      animations: "disabled",
    });
    expect(screenshot).toMatchSnapshot("boot-frozen.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
