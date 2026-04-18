import { expect, test } from "@playwright/test";

import { visitAtlasAndWaitForReady } from "./helpers";

test.describe("a11y", () => {
  test.setTimeout(60_000);

  test("A11y rail button opens the panel and Reduced Motion toggle persists", async ({
    page,
  }) => {
    await visitAtlasAndWaitForReady(page);

    // Open the A11y rail panel.
    const trigger = page.locator('[data-right-control-trigger="a11y"]');
    await trigger.dispatchEvent("click");

    const panel = page.getByTestId("a11y-panel");
    await expect(panel).toBeVisible();

    // Reduced Motion toggle — Wave 1 ships this as an active (E-class)
    // control; the setting persists to localStorage via the Zustand
    // persist middleware.
    const rmToggle = panel.getByTestId("toggle-reduced-motion");
    const before = await rmToggle.getAttribute("aria-checked");
    await rmToggle.dispatchEvent("click");

    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const raw = localStorage.getItem("atlas-orbital-store");
            if (!raw) return null;
            try {
              const parsed = JSON.parse(raw) as {
                state?: { accessibility?: { reducedMotion?: boolean } };
              };
              return parsed.state?.accessibility?.reducedMotion ?? null;
            } catch {
              return null;
            }
          }),
        { timeout: 5_000 }
      )
      .toBe(before !== "true");

    // Grayed rows are present (scope stability per design §9); they
    // render but the toggle is disabled with a tooltip.
    const highContrast = panel.getByTestId("toggle-high-contrast");
    await expect(highContrast).toBeVisible();
    await expect(highContrast).toBeDisabled();
  });
});
