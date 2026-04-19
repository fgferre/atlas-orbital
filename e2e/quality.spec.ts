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

  // The Scene panel no longer carries a Quality ChoiceButton group
  // (Wave α UX pass deduped it against Display panel — Scene now only
  // shows the current tier label and points users at Display for
  // changes). The previous "Scene-panel Quality group drives
  // graphicsSlice" test here is obsolete; the equivalent behavior
  // is covered by the Display panel test below.

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

  // Codex 2nd-round P2b: cover the Custom-flip + Reset path. The
  // earlier suite stopped at preset click, but the exact failure mode
  // that shipped in Wave α was a granular slider writing to
  // `graphicsOverrides` and nothing picking it up. This test mutates
  // a slider, verifies the slice flips to Custom, then hits the
  // "Reset to <base>" button and verifies the slice returns to the
  // named preset.
  test("Display panel slider mutation flips to Custom; Reset returns to base", async ({
    page,
  }) => {
    // Longer budget: this test walks the full Display flow (visit +
    // panel open + Auto off + preset click + slider mutate + poll +
    // reset + re-poll). Each poll can wait up to 5 s on its own.
    test.setTimeout(90_000);

    await visitAtlasAndWaitForReady(page);

    await expect(page.getByText("System Online")).toBeVisible({
      timeout: 30_000,
    });

    const displayTrigger = page.locator(
      '[data-right-control-trigger="display"]'
    );
    await displayTrigger.dispatchEvent("click");

    const panel = page.getByTestId("display-panel");
    await expect(panel).toBeVisible();

    // Lock into a known named preset (High) with Auto off — so the
    // Custom flip's customBase is deterministic.
    const autoToggle = panel.getByRole("switch", {
      name: /Auto-detect quality/i,
    });
    if ((await autoToggle.getAttribute("aria-checked")) === "true") {
      await autoToggle.dispatchEvent("click");
    }
    const presetGroup = panel.getByRole("group", { name: "Graphics preset" });
    await presetGroup
      .getByRole("button", { name: "High" })
      .dispatchEvent("click");
    await expect
      .poll(() => readPersistedField(page, "graphicsPreset"), {
        timeout: 5_000,
      })
      .toBe("high");

    // Mutate the Saturation × slider. React owns the input via its
    // synthetic event system — setting `.value` directly is ignored
    // because React's controlled-input prop override shadows the
    // native setter. The native-setter-bypass (via the prototype
    // descriptor) is the canonical workaround that lets a
    // programmatic dispatch reach React's onChange.
    const saturationSlider = panel.getByRole("slider", {
      name: /Saturation/i,
    });
    await saturationSlider.evaluate((el: HTMLInputElement) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(el, "1.5");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Slice should now hold the override + flip `graphicsPreset`
    // label to "custom" (customBase tracks the pre-mutation "high").
    await expect
      .poll(() => readPersistedField(page, "graphicsOverrides"), {
        timeout: 5_000,
      })
      .toEqual(expect.objectContaining({ saturationMul: 1.5 }));
    await expect
      .poll(() => readPersistedField(page, "graphicsPreset"), {
        timeout: 5_000,
      })
      .toBe("custom");
    await expect
      .poll(() => readPersistedField(page, "customBase"), {
        timeout: 5_000,
      })
      .toBe("high");

    // Custom badge in the DOM tracks the same derived state.
    await expect(panel.getByTestId("custom-badge")).toBeVisible();

    // Reset returns the slice to the base preset + empties overrides.
    const resetButton = panel.getByTestId("reset-overrides");
    await expect(resetButton).toBeVisible();
    await resetButton.dispatchEvent("click");
    await expect
      .poll(() => readPersistedField(page, "graphicsOverrides"), {
        timeout: 5_000,
      })
      .toEqual({});
    await expect
      .poll(() => readPersistedField(page, "graphicsPreset"), {
        timeout: 5_000,
      })
      .toBe("high");
    await expect(panel.getByTestId("custom-badge")).not.toBeVisible();
  });
});
