import { expect, test } from "@playwright/test";

import {
  dismissTutorial,
  freezeSimulation,
  visitAtlasAndWaitForReady,
} from "./helpers";

/**
 * Regression guards for the 2026-07-23 audit round. Each fix below was
 * verified by hand in runtime; these specs pin the behaviour so a future
 * change can't silently reintroduce the failure.
 *
 * Design constraint (from the audit brief): the existing boot / hyg-focus
 * specs are fragile in *sequential* runs because texture/VRAM cost
 * accumulates across pages in one Chromium process while waiting the ~55 s
 * for the loader overlay to clear. The guards here are written to be
 * deterministic and, where possible, to NOT depend on the loader
 * disappearing:
 *   - "webgl unavailable" never mounts the R3F scene at all (fastest,
 *     most stable).
 *   - "no wasm/CSP boot error" samples console + pageerror in the first
 *     ~10 s, well before the loader would clear — a CompileError would
 *     surface ~2 s after boot if it existed.
 *   - "mobile sidebar" drives selection through the imperative store hook
 *     and asserts on layout geometry, not on a rendered post-boot frame.
 */

test.describe("regression-guards", () => {
  /**
   * FIX: WebGL-unavailable fallback (`WebGLUnavailableCard` via
   * `detectWebGLSupport` in `Scene.tsx`). Before the fix, a browser/GPU
   * that couldn't create a WebGL context left the loader frozen at 8 %
   * with no `[role=alert]`. The probe now runs BEFORE `<Canvas>` mounts
   * and renders an honest fallback, and `Scene.tsx` latches
   * `setSceneReady(true)` so the loader releases instead of hanging.
   *
   * This is the most deterministic guard in the file: with WebGL forced
   * unavailable the R3F scene is never constructed, so there is no
   * texture/VRAM accumulation and nothing to wait 55 s for.
   */
  test("shows the WebGL-unavailable card (no frozen loader) when no GL context", async ({
    page,
  }) => {
    // Force every WebGL context request to fail, matching a GPU/policy
    // that cannot provide one. 2D and other contexts are untouched so the
    // rest of the DOM behaves normally. Must run before any navigation.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<HTMLCanvasElement["getContext"]>
      ): ReturnType<HTMLCanvasElement["getContext"]> {
        const [contextType] = args;
        if (
          typeof contextType === "string" &&
          contextType.toLowerCase().includes("webgl")
        ) {
          return null;
        }
        return original.apply(this, args);
      };
    });

    await dismissTutorial(page);
    await page.goto("/atlas-orbital/", { waitUntil: "domcontentloaded" });

    // The fallback card announces itself as a live region with actionable
    // copy. It should appear within a few seconds — the probe is a single
    // synchronous createElement/getContext during Scene's first render.
    const alert = page.getByRole("alert").filter({
      hasText: /WebGL is not available/i,
    });
    await expect(alert).toBeVisible({ timeout: 10_000 });

    // Instructional next step is present (not just a bare error).
    await expect(alert).toContainText(/hardware acceleration/i);

    // No stuck loader: `Scene.tsx` latches `setSceneReady(true)` on the
    // no-WebGL path so the overlay releases instead of freezing at 8 %.
    await expect(page.getByTestId("atlas-loader")).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  /**
   * FIX: CSP / WASM boot. A prior CSP tightening broke WebAssembly
   * instantiation (basis/ktx2 transcoder), throwing a `CompileError`
   * shortly after boot. This guard samples console + pageerror for the
   * first ~10 s and asserts nothing matches WebAssembly/CSP/wasm. It does
   * NOT wait for the loader to clear: a WASM `CompileError` surfaces
   * within ~2 s of boot, so the early window is sufficient and avoids the
   * fragile 55 s loader wait.
   */
  test("boots with no WebAssembly/CSP error in the console", async ({
    page,
  }) => {
    const wasmCspPattern = /WebAssembly|CSP|Content Security Policy|\bwasm\b/i;
    const offending: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error" && wasmCspPattern.test(message.text())) {
        offending.push(`console.error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      if (wasmCspPattern.test(error.message)) {
        offending.push(`pageerror: ${error.message}`);
      }
    });

    await dismissTutorial(page);
    await page.goto("/atlas-orbital/", { waitUntil: "domcontentloaded" });

    // Let the module graph evaluate, the transcoder WASM instantiate, and
    // any CSP violation fire. 10 s is generous headroom over the ~2 s a
    // CompileError would take, while staying far short of the loader
    // window so this guard doesn't inherit its sequential-run fragility.
    await page.waitForTimeout(10_000);

    expect(offending, offending.join("\n")).toEqual([]);
  });

  /**
   * FIX: mobile info-panel layout. The mobile sheet's `command-shell`
   * chrome declares `position: relative` (outside any `@layer`, so it
   * outranks Tailwind's `fixed`); applied to the framing element it
   * silently downgraded the sheet to `relative`, and the `bottom-[…]`
   * offset then shoved the header — body name included — above the top of
   * the viewport. The fix moved the chrome onto a child so the framing
   * element keeps `position: fixed`.
   *
   * Guard: on a 375×812 viewport, select a body via the imperative store
   * hook and assert the panel and its `<h1>` name sit fully on-screen
   * (bounding-box top >= 0) and the name is visible. Geometry is asserted
   * directly rather than via a settled render, so this does not depend on
   * the loader clearing.
   */
  test("keeps the mobile info-panel header on-screen after selecting a body", async ({
    page,
  }) => {
    // Boot gate (`visitAtlasAndWaitForReady`) waits up to 45 s for the
    // top-bar heading; raise the per-test budget above the 30 s default.
    test.setTimeout(120_000);

    // Freeze exposes `__ATLAS_TEST_STORE__` (see store.ts test-hook block),
    // giving deterministic selection without raycasting a live camera.
    await freezeSimulation(page);

    // Boot at the default desktop viewport: the top-bar "ATLAS ORBITAL"
    // heading the readiness gate keys on is `{!isMobile && …}` in
    // TopBar.tsx, so it never renders at a mobile width. Resize to mobile
    // AFTER boot — `useMediaQuery` subscribes to `matchMedia` changes, so
    // the Sidebar re-renders into its mobile branch reactively.
    await visitAtlasAndWaitForReady(page);
    await page.setViewportSize({ width: 375, height: 812 });

    // Store hook must be wired (freeze flag consumed).
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __ATLAS_TEST_STORE__?: { getState: () => unknown };
          };
          return typeof w.__ATLAS_TEST_STORE__?.getState === "function";
        })
      )
      .toBe(true);

    // Select Mars imperatively.
    await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__: {
          getState: () => { setSelectedId: (id: string | null) => void };
        };
      };
      w.__ATLAS_TEST_STORE__.getState().setSelectedId("mars");
    });

    // The panel body name renders as an <h1>. It uppercases via CSS, so
    // the accessible name is still "Mars".
    const panel = page.locator('[data-tutorial-target="info-panel"]');
    const heading = panel.getByRole("heading", { name: /^mars$/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Panel and header must be fully on-screen: the pre-fix regression
    // pushed the header's top edge negative (above the viewport). Poll the
    // panel box because the mobile sheet slides up via a 500 ms transform
    // transition once `isVisible` flips.
    await expect
      .poll(
        async () => {
          const box = await panel.boundingBox();
          return box ? box.y : null;
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThanOrEqual(0);

    const headingBox = await heading.boundingBox();
    expect(headingBox, "heading should have a layout box").not.toBeNull();
    expect(
      headingBox!.y,
      `heading top ${headingBox!.y} is above the viewport — mobile sheet regressed to position: relative`
    ).toBeGreaterThanOrEqual(0);
  });
});
