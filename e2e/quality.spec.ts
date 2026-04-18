import { expect, test } from "@playwright/test";

import { visitAtlasAndWaitForReady } from "./helpers";

/**
 * Helper — read a persisted-state field by path from the
 * `atlas-orbital-store` localStorage envelope.
 */
const readPersistedField = async (
  page: import("@playwright/test").Page,
  field: string
): Promise<unknown> =>
  page.evaluate((key) => {
    const raw = localStorage.getItem("atlas-orbital-store");
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { state?: Record<string, unknown> }).state?.[
        key
      ];
    } catch {
      return null;
    }
  }, field);

test.describe("quality", () => {
  test.setTimeout(60_000);

  test("Scene-panel Quality group drives graphicsSlice (post-P1.2 fix)", async ({
    page,
  }) => {
    await visitAtlasAndWaitForReady(page);

    await expect(page.getByText("System Online")).toBeVisible({
      timeout: 30_000,
    });

    // Scene-panel Quality group: after Wave α P1.2 fix it writes to
    // graphicsPreset + graphicsAutoMode on the slice (the compat
    // `qualityMode` field is no longer the source of truth; the hook
    // ignores it).
    const sceneTrigger = page.locator('[data-right-control-trigger="scene"]');
    await sceneTrigger.dispatchEvent("click");

    const qualityGroup = page.getByRole("group", { name: "Quality mode" });
    await expect(qualityGroup).toBeVisible();

    await qualityGroup
      .getByRole("button", { name: "Ultra" })
      .dispatchEvent("click");

    await expect
      .poll(() => readPersistedField(page, "graphicsPreset"), {
        timeout: 5_000,
      })
      .toBe("ultra");
    await expect
      .poll(() => readPersistedField(page, "graphicsAutoMode"), {
        timeout: 5_000,
      })
      .toBe(false);
  });

  test("Display panel preset click updates graphicsSlice + clears overrides", async ({
    page,
  }) => {
    await visitAtlasAndWaitForReady(page);

    await expect(page.getByText("System Online")).toBeVisible({
      timeout: 30_000,
    });

    // Open the Display rail panel (Wave α R2 Wave 1).
    const displayTrigger = page.locator(
      '[data-right-control-trigger="display"]'
    );
    await displayTrigger.dispatchEvent("click");

    const panel = page.getByTestId("display-panel");
    await expect(panel).toBeVisible();

    // The Auto toggle is on by default — turn it off so the preset
    // dropdown takes effect.
    const autoToggle = panel.getByRole("switch", {
      name: /Auto-detect quality/i,
    });
    // If already off, click is a no-op; either way autoMode=false
    // after this block.
    const autoChecked = await autoToggle.getAttribute("aria-checked");
    if (autoChecked === "true") {
      await autoToggle.dispatchEvent("click");
    }

    const presetGroup = panel.getByRole("group", { name: "Graphics preset" });
    await presetGroup
      .getByRole("button", { name: "Medium" })
      .dispatchEvent("click");

    await expect
      .poll(() => readPersistedField(page, "graphicsPreset"), {
        timeout: 5_000,
      })
      .toBe("medium");
    await expect
      .poll(() => readPersistedField(page, "graphicsAutoMode"), {
        timeout: 5_000,
      })
      .toBe(false);
    // Selecting a named preset should clear overrides per
    // setGraphicsPreset's contract.
    await expect
      .poll(() => readPersistedField(page, "graphicsOverrides"), {
        timeout: 5_000,
      })
      .toEqual({});
  });
});
