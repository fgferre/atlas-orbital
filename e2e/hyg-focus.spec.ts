import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
} from "./helpers";

/**
 * T6.4-M2.5 Round-6 R6-G — HYG focus arrival regression spec
 * (rewritten 2026-05-06).
 *
 * Pre-Round-6 (round-5b) this spec asserted alpha-based timings:
 * mid-warp at t=2 s, landed at t=10 s. Round-6 swaps the position
 * channel from the duration-driven `StellarFlightTransition` to
 * the gate-driven `HygPhysicsFlight` integrator, and the e2e
 * environment runs R3F at a much-reduced frame rate (often ~1 Hz
 * in headless Chromium). The integrator's sub-stepping
 * (`hygPhysicsFlight.ts:MAX_DT_SUBSTEP`) keeps the simulation
 * stable across any frame pacing, but it ALSO means the camera
 * may arrive in a single `useFrame` call when the per-frame `dt`
 * is large (catalog-load + boot accumulation can hand the
 * integrator multiple seconds at once).
 *
 * Mid-flight stride / mesh-state assertions therefore are NOT
 * suited to e2e under Round-6 — those invariants are pinned in
 * the unit tests (`hygPhysicsFlight.test.ts`) at the proper
 * scale. The e2e instead verifies the END-TO-END contract: scene
 * boots, focus dispatch propagates, integrator + orientation lerp
 * cooperate, camera lands at the expected pose, mesh activates,
 * focus survives. Plus a single mid-fly orientation-lerp sample
 * to catch a regression that re-introduces the pre-M2.5
 * `controls.target.copy(targetPos)` snap (the lerp uses
 * `performance.now()` so it tracks wall-clock independent of R3F
 * frame rate, making this one mid-fly sample reliably timed).
 *
 * Test-only window hooks used (unchanged from round-5b):
 *   - `__ATLAS_TEST_STORE__` — store access for focus dispatch.
 *   - `__ATLAS_TEST_CAMERA__` — camera position + target snapshot.
 *   - `__ATLAS_TEST_MESH_STATE__` — mesh active + skipMask reader.
 */

test.describe("hyg-focus", () => {
  // Worst-case budget: 45 s boot + ~50 s flight (1 Hz headless R3F
  // × 0.1 s integrator advance per frame for a 4.65 s Sirius
  // flight) + Playwright scheduling overhead.
  test.setTimeout(140_000);

  test("Sirius focus respects the Round-6 flight contract end-to-end", async ({
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
    // can actually consume the focus dispatch.
    await expect(page.getByTestId("atlas-loader")).toHaveCount(0, {
      timeout: 55_000,
    });

    // All three test-only window hooks must be wired up.
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

    // Pre-fly snapshot. Mesh inactive + skipMask=0 confirms no
    // accidental S6 force-activate before any flight starts.
    const initial = await page.evaluate(() => {
      const w = window as unknown as {
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
        position: cam.position,
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

    // Mid-fly orientation-lerp sample. The orientation channel uses
    // `OrientationLerp` with `performance.now()`-driven elapsed time
    // (independent of R3F frame rate), so a sample at wall-time
    // ~0.5 s reliably catches the lerp mid-progress regardless of
    // how many integrator sub-steps fired in the same window. We
    // ONLY read target here — position assertions are deferred to
    // the post-landing block because integrator pacing is
    // R3F-coupled and may already have reached gate.
    await page.waitForTimeout(500);
    const midTarget = await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_CAMERA__: () => {
          target: { x: number; y: number; z: number };
        };
      };
      return w.__ATLAS_TEST_CAMERA__().target;
    });

    // Wait for landing. Headless Chromium runs R3F at ~1 Hz, and
    // `MAX_DT_TOTAL = 0.1 s` (post Codex 2026-05-06 P1 mitigation
    // — the prior 1.0 s cap allowed 95 % of trajectory in one
    // rendered frame, defeating the no-warp purpose) caps the
    // integrator at 0.1 s per useFrame call. So under 1 Hz R3F
    // the integrator runs at 0.1 × wall-clock; a 4.65 s flight
    // takes ~47 s wall. 55 s wait absorbs that plus ramp-up plus
    // Playwright scheduling jitter, while staying inside the
    // 120 s test timeout. In production at 60 fps the integrator
    // runs at 1 × wall-clock (single substep per frame, no
    // throttling) — this slow-test cost is the explicit
    // trade-off for production warp control.
    await page.waitForTimeout(55_000);
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

    // Focus survives the fly-to (no silent defocus from a stranded
    // index or an out-of-range catalog access).
    expect(landed.focusId).toBe("hyg:0");

    // Mesh active + skipMask=1 at landing — natural sa-gate fired
    // post-landing, sprite suppressed for the focused star.
    expect(landed.meshActive, "mesh should be active post-landing").toBe(true);
    expect(landed.skipMaskAt0).toBe(1);

    // Landing distance: |camera.position - controls.target|. Post-
    // flight orientation lerp has long since settled; controls.target
    // = Sirius world position. Post-Codex-round-3 angular-radius
    // math gives ~456 wu; bracket [400, 1000] absorbs floating-
    // point drift, tan(angle) precision, and slight Sirius-radius
    // variation from the catalog's spect+absmag inputs.
    const distVec = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number }
    ): number => {
      const ax = a.x - b.x;
      const ay = a.y - b.y;
      const az = a.z - b.z;
      return Math.sqrt(ax * ax + ay * ay + az * az);
    };
    const landingDist = distVec(landed.position, landed.target);
    expect(
      landingDist,
      `landing distance ${landingDist.toFixed(2)} wu out of [400, 1000] bracket`
    ).toBeGreaterThanOrEqual(400);
    expect(
      landingDist,
      `landing distance ${landingDist.toFixed(2)} wu out of [400, 1000] bracket`
    ).toBeLessThanOrEqual(1000);

    // Target was lerped, not snapped. The orientation channel's
    // `performance.now()`-driven elapsed time + factor=17 logistic
    // sigmoid gives a measurable mid-progress sample at t=0.5 s
    // that should be NEITHER at the pre-fly target (lerp idle =
    // regression) NOR at the final endpoint (setup-time snap =
    // regression). Tolerance 1.0 wu is loose enough that small
    // catalog-position numerics don't flap.
    const midToInitial = distVec(midTarget, initial.target);
    const midToLanded = distVec(midTarget, landed.target);
    expect(
      midToInitial,
      "target did not move between pre-fly and t=0.5 s — orientation lerp may be broken"
    ).toBeGreaterThan(1.0);
    expect(
      midToLanded,
      "target reached final endpoint by t=0.5 s — possible regression to pre-M2.5 setup-time snap"
    ).toBeGreaterThan(1.0);

    // Console clean throughout the fly-to.
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
