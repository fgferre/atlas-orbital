import { expect, test } from "@playwright/test";

import { visitAtlasAndWaitForReady } from "./helpers";

test.describe("quality", () => {
  test.setTimeout(60_000);

  test("toggling the quality profile via the Project panel persists it", async ({
    page,
  }) => {
    await visitAtlasAndWaitForReady(page);

    await expect(page.getByText("System Online")).toBeVisible({
      timeout: 30_000,
    });

    // Open the Scene rail panel — it owns the Quality control group
    // (Project holds tutorial/credits/debug; Scene owns render quality,
    // scale mode, and starfield source).
    const sceneTrigger = page.locator('[data-right-control-trigger="scene"]');
    await sceneTrigger.dispatchEvent("click");

    const qualityGroup = page.getByRole("group", { name: "Quality mode" });
    await expect(qualityGroup).toBeVisible();

    const ultraButton = qualityGroup.getByRole("button", { name: "Ultra" });
    await ultraButton.dispatchEvent("click");

    // The store's persist middleware writes the unified envelope
    // (`atlas-orbital-store`) whenever partialized fields change. Poll
    // localStorage because the write is synchronous but the test race
    // with the click dispatch needs a small tolerance.
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const raw = localStorage.getItem("atlas-orbital-store");
            if (!raw) return null;
            try {
              return (JSON.parse(raw) as { state?: { qualityMode?: string } })
                .state?.qualityMode;
            } catch {
              return null;
            }
          }),
        { timeout: 5_000 }
      )
      .toBe("ultra");
  });
});
