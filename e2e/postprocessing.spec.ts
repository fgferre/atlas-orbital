import { expect, test } from "@playwright/test";

import { freezeSimulation, visitAtlasAndWaitForReady } from "./helpers";

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

  // Wave α smoke gate: 1 % pixel tolerance with the post-processing
  // pipeline active (ultra tier). Rigorous identity gate is in
  // `visualPresetOverrides.test.ts`.
  test("ultra visual identity (frozen sim)", async ({ page, context }) => {
    await freezeSimulation(page);
    await context.addInitScript((envelope) => {
      localStorage.setItem("atlas-orbital-store", JSON.stringify(envelope));
    }, seedQualityMode("ultra"));

    await visitAtlasAndWaitForReady(page);

    const marker = page.locator("[data-postprocessing]");
    await expect(marker).toHaveAttribute("data-postprocessing", "active");

    await page.waitForTimeout(2000);
    const screenshot = await page.screenshot({ animations: "disabled" });
    expect(screenshot).toMatchSnapshot("postprocessing-ultra-frozen.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
