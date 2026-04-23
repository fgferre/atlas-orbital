import { expect, test } from "@playwright/test";

import { visitAtlasAndWaitForReady } from "./helpers";

const seedQualityMode = (mode: "constrained" | "ultra") => ({
  state: {
    qualityMode: mode,
    sunRenderMode: "auto",
    tutorialCompletionStatus: "completed",
  },
  version: 0,
});

test.describe("postprocessing", () => {
  test.setTimeout(60_000);

  test("constrained tier does not mount the post-processing pipeline", async ({
    page,
    context,
  }) => {
    await context.addInitScript((envelope) => {
      localStorage.setItem("atlas-orbital-store", JSON.stringify(envelope));
    }, seedQualityMode("constrained"));

    await visitAtlasAndWaitForReady(page);

    const marker = page.locator("[data-postprocessing]");
    await expect(marker).toHaveAttribute("data-postprocessing", "inactive");
  });

  test("ultra tier mounts the post-processing pipeline", async ({
    page,
    context,
  }) => {
    await context.addInitScript((envelope) => {
      localStorage.setItem("atlas-orbital-store", JSON.stringify(envelope));
    }, seedQualityMode("ultra"));

    await visitAtlasAndWaitForReady(page);

    const marker = page.locator("[data-postprocessing]");
    await expect(marker).toHaveAttribute("data-postprocessing", "active");
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
