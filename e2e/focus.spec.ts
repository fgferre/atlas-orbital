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

    // Wait for the context line — the top bar is interactive once it is
    // reporting real state. It replaced a decorative "System Online"
    // string, which was never a readiness signal, only a label that
    // happened to render late.
    await expect(page.getByTestId("context-line")).toBeVisible({
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

  // NB: Wave α considered adding a visual-diff test here, but the Mars
  // selection runs camera damping on the wall clock (NOT the frozen
  // simulation clock), and OrbitControls convergence after 2.5 s of
  // settle varied by up to 42 % of pixels run-to-run — no meaningful
  // tolerance makes this a gate. The structural test above (Mars
  // appears in the info panel) stays; the render-identity check is
  // covered by `boot.spec.ts` / `postprocessing.spec.ts` at 1 %
  // tolerance plus `visualPresetOverrides.test.ts` (pure-function
  // equality) which is stricter than any pixel-diff.
});
