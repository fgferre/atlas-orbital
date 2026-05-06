import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
} from "./helpers";

/**
 * T6.4-M2.5 S7 + Codex round-3 hotfix (2026-05-05) — HYG focus
 * arrival regression spec.
 *
 * Triggers a fly-to to Sirius (`hyg:0`) via the test-only store
 * exposure (`window.__ATLAS_TEST_STORE__`, gated on
 * `__ATLAS_TEST_FREEZE__` in `src/store.ts`), then asserts the
 * full M2.5 flight contract:
 *
 *   - Focus survives the fly-to (no silent defocus).
 *   - Console clean (no GLSL compile errors, no R3F frame-loop
 *     throws, no NaN spam from a mis-wired transition lerp, no
 *     unhandled promise rejections).
 *   - Target is LERPED, not snapped at setup (catches a regression
 *     where a future change accidentally re-introduces the pre-M2.5
 *     `controls.target.copy(targetPos)` snap).
 *   - Landing distance lands in the post-C-1 angular-radius
 *     bracket `[400, 1000] wu` for Sirius (the angular-radius math
 *     gives ~456 wu; bracket gives slack for clock jitter and
 *     Math.tan precision).
 *   - Mesh active state at landing matches the natural sa-driven
 *     gate (no S6-style force-activate writing skipMask too early).
 *   - skipMask timing tracks meshActive (0 pre-fly, 0 mid-fly,
 *     1 post-landing).
 *
 * Test-only window hooks used:
 *   - `__ATLAS_TEST_STORE__` (existing, S7) — store access for
 *     focus dispatch.
 *   - `__ATLAS_TEST_CAMERA__` (Codex round-3 P2) — camera position,
 *     OrbitControls target, camera quaternion as plain objects.
 *     Wired in `Scene.tsx`'s `<TestCameraProbe>`.
 *   - `__ATLAS_TEST_MESH_STATE__` (Codex round-3 P2) — mesh active
 *     boolean + skipMask reader. Wired in `<HygStellarMesh>`.
 *
 * Pixel-diff arrival pose is intentionally OUT OF SCOPE: the
 * screenshot would need a baseline that's per-DPR / per-machine-GPU.
 * Structural assertions catch the regression surface area for M2.5.
 */

test.describe("hyg-focus", () => {
  // Worst-case budget: 45 s boot + 8 s position-channel + 2 s
  // headroom + Playwright overhead.
  test.setTimeout(120_000);

  test("Sirius focus respects the M2.5 flight contract end-to-end", async ({
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

    // All three test-only window hooks must be wired up. Production
    // code never sets `__ATLAS_TEST_FREEZE__`, so getting here means
    // the helper injected it correctly and Scene.tsx /
    // HygStellarMesh have mounted their probes.
    const hooksWired = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__?: { getState: () => unknown };
        __ATLAS_TEST_CAMERA__?: () => unknown;
        __ATLAS_TEST_MESH_STATE__?: () => unknown;
      };
      return {
        store: typeof w.__ATLAS_TEST_STORE__?.getState === "function",
        camera: typeof w.__ATLAS_TEST_CAMERA__ === "function",
        meshState: typeof w.__ATLAS_TEST_MESH_STATE__ === "function",
      };
    });
    expect(hooksWired.store, "test-only store hook missing").toBe(true);
    expect(hooksWired.camera, "test-only camera hook missing").toBe(true);
    expect(hooksWired.meshState, "test-only mesh-state hook missing").toBe(
      true
    );

    // Wait for the intro animation to finish so dispatching focus
    // immediately consumes (the focus useEffect early-returns on
    // `isIntroAnimating`).
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __ATLAS_TEST_STORE__?: {
                getState: () => { isIntroAnimating: boolean };
              };
            };
            return w.__ATLAS_TEST_STORE__?.getState().isIntroAnimating ?? true;
          }),
        { timeout: 30_000 }
      )
      .toBe(false);

    // Pre-fly snapshots — capture target so we can later confirm
    // it lerped (not snapped) and skipMask so we can confirm it
    // was 0 before any flight machinery ran for hyg:0.
    const initial = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_CAMERA__: () => {
          target: { x: number; y: number; z: number };
        };
        __ATLAS_TEST_MESH_STATE__: () => {
          meshActive: boolean;
          skipMaskAtIndex: (k: number) => number;
        };
      };
      const cam = w.__ATLAS_TEST_CAMERA__();
      const mesh = w.__ATLAS_TEST_MESH_STATE__();
      return {
        target: cam.target,
        meshActive: mesh.meshActive,
        skipMaskAt0: mesh.skipMaskAtIndex(0),
      };
    });
    expect(initial.meshActive, "mesh should be inactive pre-fly").toBe(false);
    expect(initial.skipMaskAt0, "skipMask should be 0 pre-fly").toBe(0);

    // Dispatch the HYG focus. Sirius = hyg:0 (brightest catalog
    // entry, magnitude sort, see build-hyg-binary.js).
    await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__: {
          getState: () => { setFocusId: (id: string | null) => void };
        };
      };
      w.__ATLAS_TEST_STORE__.getState().setFocusId("hyg:0");
    });

    // Sample 1 — t = 0.5 s after dispatch. Position channel raw
    // alpha ~0.06, orientation channel raw alpha ~0.5 (1s clamp).
    // target should be measurably moving but not yet at endpoint.
    await page.waitForTimeout(500);
    const t05 = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_CAMERA__: () => {
          target: { x: number; y: number; z: number };
        };
      };
      return w.__ATLAS_TEST_CAMERA__().target;
    });

    // Sample 2 — t = 2 s total. With round-4 C-6 the position
    // channel duration for Sirius (2.6 pc) is ~4123 ms; with
    // round-5 factor=60, the warp is concentrated in raw alpha
    // [0.3, 0.7] ⇒ wall-clock [1.24 s, 2.89 s]. So at t=2 s the
    // camera is mid-warp — target lerp running, mesh natural
    // sa-driven gate not yet crossed (C-2 force-activate is
    // reverted, so no force-on either). Combined sample reads
    // both target (for the lerp-not-snapped trend) AND mesh
    // state (regression pin against re-introducing force-activate).
    await page.waitForTimeout(1500);
    const mid = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_CAMERA__: () => {
          target: { x: number; y: number; z: number };
        };
        __ATLAS_TEST_MESH_STATE__: () => {
          meshActive: boolean;
          skipMaskAtIndex: (k: number) => number;
        };
      };
      const cam = w.__ATLAS_TEST_CAMERA__();
      const mesh = w.__ATLAS_TEST_MESH_STATE__();
      return {
        target: cam.target,
        meshActive: mesh.meshActive,
        skipMaskAt0: mesh.skipMaskAtIndex(0),
      };
    });
    const t2 = mid.target;
    expect(
      mid.meshActive,
      "mesh should still be inactive mid-warp (t=2s, C-2 force-activate revert)"
    ).toBe(false);
    expect(
      mid.skipMaskAt0,
      "skipMask should still be 0 mid-warp (t=2s, C-2 force-activate revert)"
    ).toBe(0);

    // Sample 3 — t = 10 s total. Position channel done, mesh
    // active, skipMask = 1, camera at landing distance. Pre-
    // round-4 (when posDurationMs saturated at 8 s for every HYG
    // fly-to) the mid-fly mesh check ran at t=4 s; round-4's
    // parsec-scale duration formula brought Sirius down to
    // ~4.1 s, and round-5's factor=60 concentrates the warp
    // around t∈[1.24s, 2.89s], so the mid-fly sample moved up
    // to t=2 s (combined with sample 2 above). The 8 s wait
    // here keeps total elapsed at 10 s for the landed sample.
    await page.waitForTimeout(8000);
    const landed = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__: { getState: () => { focusId: string | null } };
        __ATLAS_TEST_CAMERA__: () => {
          position: { x: number; y: number; z: number };
          target: { x: number; y: number; z: number };
        };
        __ATLAS_TEST_MESH_STATE__: () => {
          meshActive: boolean;
          skipMaskAtIndex: (k: number) => number;
        };
      };
      const cam = w.__ATLAS_TEST_CAMERA__();
      const mesh = w.__ATLAS_TEST_MESH_STATE__();
      return {
        focusId: w.__ATLAS_TEST_STORE__.getState().focusId,
        position: cam.position,
        target: cam.target,
        meshActive: mesh.meshActive,
        skipMaskAt0: mesh.skipMaskAtIndex(0),
      };
    });

    // Focus survives the fly-to (no silent defocus from a
    // stranded index or out-of-range catalog access).
    expect(landed.focusId).toBe("hyg:0");

    // Mesh active and skipMask=1 at landing — natural sa-driven
    // gate fired post-landing, sprite suppressed for the focused
    // star.
    expect(
      landed.meshActive,
      "mesh should be active at t=10s post-landing"
    ).toBe(true);
    expect(landed.skipMaskAt0).toBe(1);

    // Landing distance: |camera.position - controls.target|. Post-
    // M2.5-fly, `controls.target` equals the star world position
    // (focus-tracking glues them after the transition completes).
    // Post-Codex-round-3 angular-radius math gives ~456 wu for
    // Sirius; bracket [400, 1000] absorbs floating-point drift,
    // tan(angle) precision, and any slight Sirius-radius variation
    // from the catalog's spect+absmag inputs.
    const dx = landed.position.x - landed.target.x;
    const dy = landed.position.y - landed.target.y;
    const dz = landed.position.z - landed.target.z;
    const landingDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(
      landingDist,
      `landing distance ${landingDist.toFixed(2)} wu out of [400, 1000] bracket`
    ).toBeGreaterThanOrEqual(400);
    expect(
      landingDist,
      `landing distance ${landingDist.toFixed(2)} wu out of [400, 1000] bracket`
    ).toBeLessThanOrEqual(1000);

    // Target was lerped, not snapped — distinct samples that
    // trend toward the final endpoint.
    const dist = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number }
    ): number => {
      const ax = a.x - b.x;
      const ay = a.y - b.y;
      const az = a.z - b.z;
      return Math.sqrt(ax * ax + ay * ay + az * az);
    };
    const t05ToInitial = dist(t05, initial.target);
    const t05ToLanded = dist(t05, landed.target);
    const t2ToLanded = dist(t2, landed.target);
    // (a) target moved between pre-fly and t=0.5s — not frozen.
    //     If a regression froze the lerp, this collapses to ~0.
    expect(
      t05ToInitial,
      "target did not move between pre-fly and t=0.5s — orientation lerp may be broken"
    ).toBeGreaterThan(1.0);
    // (b) target at t=0.5s is NOT at the final endpoint — proves
    //     setup did NOT snap target to star_world_pos. If the
    //     pre-M2.5 `controls.target.copy(targetPos)` snap returned,
    //     this collapses to ~0.
    expect(
      t05ToLanded,
      "target reached final endpoint by t=0.5s — possible regression to pre-M2.5 setup-time snap"
    ).toBeGreaterThan(1.0);
    // (c) target at t=2s is closer to the endpoint than at t=0.5s
    //     — monotonic trend toward star world position.
    expect(
      t05ToLanded,
      "target did not trend monotonically toward star world position"
    ).toBeGreaterThan(t2ToLanded);

    // Console clean throughout the fly-to. The `THREE.WebGLProgram
    //    Program Info Log` X4122/X4008 precision warnings on the
    //    boot path arrive as `console.warn` (not `error`), so the
    //    error filter at the `page.on("console")` handler above
    //    already excludes them.
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
