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
});
