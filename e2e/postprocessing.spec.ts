import { expect, test } from "@playwright/test";

import { canvasLitFraction, visitAtlasAndWaitForReady } from "./helpers";

/**
 * Minimum lit fraction of the scene crop. Sits ~7× above the ~0.2 % a
 * never-drawn canvas produces and ~3× below the ~4.3 % the weakest tier
 * reaches, so it only trips on "no draw call at all", never on tier
 * degradation. Polled rather than sampled once: the intro camera is
 * still flying for ~45 s after boot and framing at any single instant
 * is not a contract.
 */
const MIN_LIT_FRACTION = 0.015;

const seedQualityMode = (mode: "constrained" | "ultra") => ({
  state: {
    qualityMode: mode,
    sunRenderMode: "auto",
    tutorialCompletionStatus: "completed",
  },
  version: 0,
});

test.describe("postprocessing", () => {
  test.setTimeout(90_000);

  test("constrained tier does not mount the post-processing pipeline", async ({
    page,
    context,
  }) => {
    await context.addInitScript((envelope) => {
      localStorage.setItem("atlas-orbital-store", JSON.stringify(envelope));
    }, seedQualityMode("constrained"));
    await page.setViewportSize({ width: 1440, height: 900 });

    await visitAtlasAndWaitForReady(page);

    const marker = page.locator("[data-postprocessing]");
    await expect(marker).toHaveAttribute("data-postprocessing", "inactive");

    // The tier that skips the composer still has to draw. Until
    // `DirectRenderPass` landed it did not: R3F stops auto-rendering as
    // soon as any `useFrame` claims a non-zero priority, and with the
    // composer unmounted nothing else issued `gl.render`.
    // The loader overlay is itself bright and covers the crop, so it
    // would satisfy the gate over a canvas that never drew a pixel.
    await expect(page.getByTestId("atlas-loader")).toBeHidden({
      timeout: 45_000,
    });
    await expect
      .poll(() => canvasLitFraction(page), { timeout: 45_000 })
      .toBeGreaterThan(MIN_LIT_FRACTION);
  });

  test("ultra tier mounts the post-processing pipeline", async ({
    page,
    context,
  }) => {
    await context.addInitScript((envelope) => {
      localStorage.setItem("atlas-orbital-store", JSON.stringify(envelope));
    }, seedQualityMode("ultra"));
    await page.setViewportSize({ width: 1440, height: 900 });

    await visitAtlasAndWaitForReady(page);

    const marker = page.locator("[data-postprocessing]");
    await expect(marker).toHaveAttribute("data-postprocessing", "active");

    // The loader overlay is itself bright and covers the crop, so it
    // would satisfy the gate over a canvas that never drew a pixel.
    await expect(page.getByTestId("atlas-loader")).toBeHidden({
      timeout: 45_000,
    });
    await expect
      .poll(() => canvasLitFraction(page), { timeout: 45_000 })
      .toBeGreaterThan(MIN_LIT_FRACTION);
  });

  // NB: Wave α Commit 2 attempted an "ultra visual identity (frozen
  // sim)" screenshot test here. With the HDR postprocess pipeline
  // active, Chromium's headless
  // `Page.captureScreenshot` protocol hangs past a 60 s test timeout
  // when the renderer is mid-allocation — reproducibly, not
  // intermittently. A 3-attempt retry wrapper (`screenshotWithRetry`)
  // with 2 s backoff did not recover. The structural test above
  // still verifies the pipeline mounts on ultra; the
  // `boot visual identity` screenshot in `e2e/boot.spec.ts` still
  // exercises a screenshot against the default tier. Rigorous Wave 0
  // identity is `src/components/canvas/scene/visualPresetOverrides.test.ts`;
  // HDR-emissive contract expectations are pinned in
  // `src/lib/starfieldShaderMath.test.ts`.
});
