import { expect, test } from "@playwright/test";

import { pageHasSizedCanvas, visitAtlasAndWaitForReady } from "./helpers";

test.describe("boot", () => {
  test("mounts a sized canvas and logs no console errors within 15s", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await visitAtlasAndWaitForReady(page);

    await expect
      .poll(async () => pageHasSizedCanvas(page), { timeout: 15_000 })
      .toBe(true);

    // Atlas never mounts a dismissible splash DOM node — readiness is
    // inferred from the heading + sized canvas gate above. Assert the
    // "Initializing Simulation" loader is no longer on screen.
    await expect(page.getByText("Initializing Simulation")).toHaveCount(0);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
