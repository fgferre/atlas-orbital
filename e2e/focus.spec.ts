import { expect, test } from "@playwright/test";

import { visitAtlasAndWaitForReady } from "./helpers";

test.describe("focus", () => {
  // Loader + canvas mount + search panel animation can exceed Playwright's
  // default 30s budget on cold preview starts.
  test.setTimeout(60_000);

  test("searching for Mars and selecting it reveals the body in the info panel", async ({
    page,
  }) => {
    await visitAtlasAndWaitForReady(page);

    // Wait for the system-online telemetry line — that's the signal the
    // top bar is fully interactive, not just mounted.
    await expect(page.getByText("System Online")).toBeVisible({
      timeout: 30_000,
    });

    const searchTrigger = page
      .locator('[data-tutorial-target="search"]')
      .getByRole("button", { name: "Open search panel" });
    // `dispatchEvent` bypasses the stability wait that framer-motion's
    // layout shifts can otherwise violate — the phase4 regression suite
    // uses the same pattern.
    await searchTrigger.dispatchEvent("click");

    const searchPanel = page.locator("#atlas-search-panel");
    await expect(searchPanel).toBeVisible();

    const searchInput = searchPanel.getByRole("combobox");
    await searchInput.fill("mars");

    const marsOption = searchPanel
      .getByRole("option")
      .filter({ hasText: /mars/i })
      .first();
    await expect(marsOption).toBeVisible();
    await marsOption.dispatchEvent("click");

    const infoPanel = page.locator('[data-tutorial-target="info-panel"]');
    await expect
      .poll(async () => (await infoPanel.textContent()) ?? "", {
        timeout: 15_000,
      })
      .toContain("MARS");
  });
});
