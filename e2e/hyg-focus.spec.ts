import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
} from "./helpers";

/**
 * T6.4-M2.5 S7 — HYG focus arrival regression spec.
 *
 * Triggers a fly-to to Sirius (`hyg:0`) via the test-only store
 * exposure (`window.__ATLAS_TEST_STORE__`, gated on
 * `__ATLAS_TEST_FREEZE__` in `src/store.ts`), waits the maximum
 * fly-to budget (8 s position-channel cap from S4's
 * `posDurationMs` clamp + 2 s headroom), then asserts:
 *
 *   - The focus id stayed on `hyg:0` after the wait. This catches
 *     the strand-and-defocus regression class: the Codex round-2
 *     P2 path in `HygStellarMesh.tsx` and the sister branch in
 *     `CameraController.tsx` defocus to null when the catalog
 *     index is out of range (e.g., quality downgrade past Proxima).
 *     If S4's setupCameraHyg early-returned, or if S5's interrupt
 *     handler nuked the wrong piece of state, focus would flip
 *     back to null long before the 10 s wait elapsed.
 *   - Console stayed clean throughout the fly-to (no GLSL compile
 *     errors, no R3F frame-loop throws from the new useFrame
 *     branch, no NaN spam from a mis-wired transition lerp, no
 *     unhandled promise rejections from the catalog-load path
 *     interleaving with focus dispatch).
 *
 * Pixel-diff arrival pose is intentionally OUT OF SCOPE here:
 * the screenshot would need a baseline that's per-DPR /
 * per-machine-GPU, and atlas-orbital's existing visual-diff
 * specs (`boot.spec.ts`, `postprocessing.spec.ts`) document why
 * the pixel-diff approach is brittle at frame-loop="always"
 * cadence. The structural assertions above catch the regression
 * surface area that matters for M2.5: the new code path runs to
 * completion without crashing or stranding focus.
 *
 * Procedural-mesh skipMask verification was attempted but
 * dropped: reading `scene.getObjectByName("atlas-starfield")
 * .geometry.getAttribute("a_skipMask")` from outside React
 * requires walking R3F's private `canvas.__r3f.root` handle,
 * which isn't covered by R3F's public types and turned out to
 * be unreliable across the Playwright headless boot path. The
 * vitest unit tests on `stellarMeshGate.ts` plus the runtime
 * smoke (preview MCP) covered in S6 already pin the gate
 * behavior; this spec's job is regression coverage on the
 * controller integration, not the gate itself.
 */

test.describe("hyg-focus", () => {
  // Worst-case budget: 45 s boot + 8 s position-channel + 2 s
  // headroom + Playwright overhead.
  test.setTimeout(120_000);

  test("Sirius focus survives the fly-to without errors or defocus", async ({
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

    await freezeSimulation(page);
    await visitAtlasAndWaitForReady(page);

    await expect
      .poll(async () => pageHasSizedCanvas(page), { timeout: 20_000 })
      .toBe(true);

    // Wait for the loader overlay to clear so the HYG catalog has
    // had a chance to load and `CameraController.setupCameraHyg`
    // can actually consume the focus dispatch (otherwise the
    // useEffect early-returns on `!hygCatalog`).
    await expect(page.getByTestId("atlas-loader")).toHaveCount(0, {
      timeout: 55_000,
    });

    // Sanity: the test store hook is wired up (production code
    // never sets the flag, so getting here means the helper
    // injected it correctly).
    const storeWired = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__?: { getState: () => unknown };
      };
      return typeof w.__ATLAS_TEST_STORE__?.getState === "function";
    });
    expect(
      storeWired,
      "test-only store hook missing — verify __ATLAS_TEST_FREEZE__"
    ).toBe(true);

    // Dispatch the HYG focus directly through the test store
    // exposure. Sirius = hyg:0 (brightest catalog entry, magnitude
    // sort, see build-hyg-binary.js).
    await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__?: {
          getState: () => { setFocusId: (id: string | null) => void };
        };
      };
      w.__ATLAS_TEST_STORE__?.getState().setFocusId("hyg:0");
    });

    // Wait the position-channel cap (8 s) plus a 2 s safety margin
    // for OrbitControls damping post-fly. The S4 controller adds
    // scale-aware durations; for a parsec-scale start position
    // they always saturate the 8 s clamp.
    await page.waitForTimeout(10_000);

    const afterFocus = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__?: { getState: () => { focusId: string | null } };
      };
      return w.__ATLAS_TEST_STORE__?.getState().focusId ?? null;
    });

    // Focus ID survives the fly-to (no silent defocus from a
    // stranded index or out-of-range catalog access). 10 s of
    // wall time covers the position-channel cap (8 s) plus
    // OrbitControls damping; if the new useFrame branch had
    // crashed or the catalog had stranded the index, the
    // sister-branch defocus paths in `CameraController.tsx`
    // and `HygStellarMesh.tsx` would have flipped focusId back
    // to null long before this read.
    expect(afterFocus).toBe("hyg:0");

    // Console clean throughout the fly-to. The `THREE.WebGLProgram
    //    Program Info Log` X4122/X4008 precision warnings on the
    //    boot path arrive as `console.warn` (not `error`), so the
    //    error filter at the `page.on("console")` handler above
    //    already excludes them.
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
