import { test, expect } from "@playwright/test";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:4174/atlas-orbital/";

const dismissTutorial = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("tutorialStatus", "completed");
  });
};

const openDrawer = async (trigger, panel) => {
  if ((await panel.count()) === 1) {
    return;
  }

  await trigger.dispatchEvent("click");
  await trigger.page().waitForTimeout(150);
  await expect.poll(async () => await panel.count()).toBe(1);
};

const overlayCanvasHasRenderedPixels = async (page, index = 1) =>
  page.evaluate((canvasIndex) => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const canvas = canvases[canvasIndex];
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { exists: false, rendered: false };
    }

    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;

    return {
      exists: true,
      rendered: canvas.toDataURL() !== blank.toDataURL(),
    };
  }, index);

test.describe("Phase 4 overlay regression", () => {
  test.describe.configure({ timeout: 120_000 });

  test("desktop keeps the mandatory controls and flows operable", async ({
    page,
  }) => {
    const searchTrigger = page
      .locator('[data-tutorial-target="search"]')
      .getByRole("button", { name: "Open search panel" });
    const settingsRail = page.locator('[data-tutorial-target="settings"]');
    const sceneTrigger = settingsRail.getByRole("button", {
      name: "Scene",
      exact: true,
    });
    const overlayTrigger = settingsRail.getByRole("button", {
      name: "Overlay",
      exact: true,
    });
    const projectTrigger = settingsRail.getByRole("button", {
      name: "Project",
      exact: true,
    });

    await dismissTutorial(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await expect(searchTrigger).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "ATLAS ORBITAL" }).last()
    ).toBeVisible();
    await expect(page.getByText("System Online")).toBeVisible();
    await expect(page.getByTitle(/^Back/)).toBeVisible();
    await expect(page.getByTitle(/^Home/)).toBeVisible();

    await expect(searchTrigger).toBeVisible();
    await expect(page.getByRole("button", { name: "Scene" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Overlay" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Project" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: /collapse timeline|expand timeline/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "LIVE MODE" })).toBeVisible();
    await expect(page.getByLabel("Pause timeline")).toBeVisible();

    await page
      .getByRole("button", { name: /collapse timeline|expand timeline/i })
      .click();

    await expect(
      page.getByRole("button", { name: "NORMAL RATE" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rewind simulation rate" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Advance simulation rate" })
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: "Simulation rate" })
    ).toBeVisible();

    const searchPanel = page.locator("#atlas-search-panel");
    await openDrawer(searchTrigger, searchPanel);
    await expect
      .poll(async () => (await searchPanel.textContent()) ?? "")
      .toContain("Quick Jumps");
    await searchPanel
      .getByRole("button", { name: "Earth", exact: true })
      .dispatchEvent("click");

    const infoPanel = page.locator('[data-tutorial-target="info-panel"]');
    await expect
      .poll(async () => (await infoPanel.textContent()) ?? "")
      .toContain("EARTH");
    const infoPanelText = (await infoPanel.textContent()) ?? "";
    expect(infoPanelText).toContain("Selected Body");
    expect(infoPanelText).toContain("Real-time Telemetry");

    const scenePanel = page.locator("#atlas-scene-panel");
    await openDrawer(sceneTrigger, scenePanel);
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "")
      .toContain("Tycho-2");
    const scenePanelText = (await page.locator("body").textContent()) ?? "";
    expect(scenePanelText).toContain("NASA Eyes");
    expect(scenePanelText).toContain("Didactic");
    expect(scenePanelText).toContain("Realistic");

    const overlayPanel = page.locator("#atlas-overlay-panel");
    await openDrawer(overlayTrigger, overlayPanel);
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "")
      .toContain("Comets");
    const overlayPanelText = (await page.locator("body").textContent()) ?? "";
    expect(overlayPanelText).toContain("Labels");

    const projectPanel = page.locator("#atlas-project-panel");
    await openDrawer(projectTrigger, projectPanel);
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "")
      .toContain("Replay Tutorial");
    const projectPanelText = (await page.locator("body").textContent()) ?? "";
    expect(projectPanelText).toContain("Mission Report");
    expect(projectPanelText).toContain("Debug Menu");
    expect(projectPanelText).toContain("v0.1.0 | Atlas Orbital");
  });

  test("mobile keeps primary tools reachable within overlay sheets", async ({
    page,
  }) => {
    const searchTrigger = page
      .locator('[data-tutorial-target="search"]')
      .getByRole("button", { name: "Open search panel" });
    const settingsRail = page.locator('[data-tutorial-target="settings"]');
    const sceneTrigger = settingsRail.getByRole("button", {
      name: "Scene",
      exact: true,
    });

    await dismissTutorial(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await expect(searchTrigger).toBeVisible();

    for (const label of ["Search", "Scene", "Overlay", "Project"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: /collapse timeline|expand timeline/i })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "LIVE MODE" })).toBeVisible();

    const mobileSearchPanel = page.locator("#atlas-search-panel");
    await openDrawer(searchTrigger, mobileSearchPanel);
    await expect
      .poll(async () => (await mobileSearchPanel.textContent()) ?? "")
      .toContain("Quick Jumps");
    await mobileSearchPanel
      .getByRole("button", { name: "Earth", exact: true })
      .dispatchEvent("click");

    await expect(
      page.getByRole("button", { name: "Close selected body panel" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Scene" })).toBeVisible();

    await page
      .getByRole("button", { name: /collapse timeline|expand timeline/i })
      .click();
    await expect(
      page.getByRole("button", { name: "NORMAL RATE" })
    ).toBeVisible();

    const sceneDialog = page.getByRole("dialog", { name: "Scene" });
    await openDrawer(sceneTrigger, sceneDialog);
    await expect
      .poll(async () => (await page.locator("body").textContent()) ?? "")
      .toContain("Tycho-2");
    const sceneDialogText = (await page.locator("body").textContent()) ?? "";
    expect(sceneDialogText).toContain("NASA Eyes");
    expect(sceneDialogText).toContain("Close");
  });

  test("procedural sun renders a non-empty overlay canvas", async ({
    page,
  }) => {
    const settingsRail = page.locator('[data-tutorial-target="settings"]');
    const sceneTrigger = settingsRail.getByRole("button", {
      name: "Scene",
      exact: true,
    });
    const proceduralButton = page.getByRole("button", {
      name: "Procedural",
      exact: true,
    });

    await dismissTutorial(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

    await expect(sceneTrigger).toBeVisible();
    if (!(await proceduralButton.isVisible())) {
      await sceneTrigger.click();
    }
    await expect(proceduralButton).toBeVisible();
    await proceduralButton.click();

    await expect
      .poll(async () => (await page.locator("canvas").count()) >= 2)
      .toBe(true);

    await expect
      .poll(async () => await overlayCanvasHasRenderedPixels(page), {
        timeout: 20_000,
      })
      .toEqual({ exists: true, rendered: true });
  });
});
