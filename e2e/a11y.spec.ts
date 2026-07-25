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

    // Honesty contract, replacing a pin that asserted the opposite: this
    // panel must not advertise accessibility controls it cannot deliver.
    // Colorblind Mode and High Contrast used to render here disabled under
    // "Available in a future update" — a promise broken at the exact moment
    // a user who needs them goes looking. Wire them and this assertion
    // should be replaced by one that exercises the real behaviour, not
    // loosened.
    await expect(panel.getByText(/future update/i)).toHaveCount(0);
    await expect(
      panel.locator("[disabled], [aria-disabled='true']")
    ).toHaveCount(0);
  });
});
