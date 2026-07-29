import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
} from "./helpers";

/**
 * Forced-ultra GLSL-compile regression net.
 *
 * ## What this catches, and why nothing else in `e2e/` does
 *
 * `boot.spec.ts`'s console-error gate only observes whatever the boot
 * camera happens to frame — the default boot pose (a wide, realistic-mode
 * system overview, see the lighting wave file's "Queue step 2 shipped"
 * section) has no resolvable Io/Europa/Moon disc, so a shader that fails to
 * COMPILE for exactly those three bodies produces zero console output that
 * gate can see. This is not hypothetical: `planetshinePatch.ts` shipped
 * (commit 26cb756) referencing `u_shineDir` / `u_shineRadiance` in its
 * injected GLSL without ever declaring either as a `uniform` — a hard
 * compile failure for Io, Europa and the Moon (`'u_shineDir' : undeclared
 * identifier`, three.js reports shader link failures as `console.error`,
 * never a thrown exception) — and every existing gate (`test:run`,
 * `tsc -b`, `lint`, `boot.spec.ts`) stayed green. The defect was only found
 * by a forced-ultra headless verification pass (2026-07-29, see the
 * lighting wave file's "forced-ultra headless verification pass" section)
 * that explicitly focused each recipient body and read the console. This
 * spec commits that technique as a permanent gate instead of a one-off
 * throwaway harness.
 *
 * ## The forced-ultra unlock
 *
 * Headless Chromium's SwiftShader software renderer auto-detects as the
 * `constrained` quality tier, which gates out several patched material
 * families' more expensive branches. `window.__ATLAS_TEST_STORE__` (wired
 * whenever `__ATLAS_TEST_FREEZE__` is set — see `store.ts`) exposes
 * `setGraphicsAutoMode` / `setGraphicsPreset` so this spec can force the
 * `ultra` tier directly, bypassing the auto-detect ceiling entirely.
 *
 * ## Coverage
 *
 * One representative body per `onBeforeCompile` GLSL patch variant this
 * repo ships, focused in turn against a single page load:
 *   - `moon`, `io` — the planetshine/earthshine RECIPIENTS (this defect's
 *     own bodies), both also airless-regolith (Lommel-Seeliger).
 *   - `mercury` — airless-regolith, NOT a shine recipient.
 *   - `earth` — the day/night branch (`tNight` + eclipse uniforms).
 *   - `saturn` — the ring-shadow branch.
 * Together these touch every branch of `usePlanetMaterials.ts`'s
 * `planetMaterial` `useMemo` and every variant `buildPlanetDirectLightPatch`
 * / `applyPlanetshinePatch` can emit.
 */
test.describe("ultra-shaders", () => {
  test.setTimeout(120_000);

  test("forced-ultra focus sweep compiles every patched material family with zero console errors", async ({
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

    // Freeze exposes `__ATLAS_TEST_STORE__` — required for both the focus
    // dispatch below and the forced-ultra unlock.
    await freezeSimulation(page);
    await visitAtlasAndWaitForReady(page);

    await expect
      .poll(async () => pageHasSizedCanvas(page), { timeout: 20_000 })
      .toBe(true);

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

    // Forced-ultra unlock, immediately after the test store appears —
    // before the intro flight even ends, so every material that compiles
    // from here on compiles at the highest permutation tier this session
    // can reach.
    await page.evaluate(() => {
      const w = window as unknown as {
        __ATLAS_TEST_STORE__: {
          getState: () => {
            setGraphicsAutoMode: (on: boolean) => void;
            setGraphicsPreset: (preset: string) => void;
          };
        };
      };
      const { setGraphicsAutoMode, setGraphicsPreset } =
        w.__ATLAS_TEST_STORE__.getState();
      setGraphicsAutoMode(false);
      setGraphicsPreset("ultra");
    });

    // Confirm the unlock actually took (persisted store field, same read
    // path `quality.spec.ts` uses) rather than trusting the write silently.
    const forcedPreset = await page.evaluate(() => {
      const raw = window.localStorage.getItem("atlas-orbital-store");
      if (!raw) return null;
      try {
        return (JSON.parse(raw) as { state?: { graphicsPreset?: string } })
          .state?.graphicsPreset;
      } catch {
        return null;
      }
    });
    expect(forcedPreset).toBe("ultra");

    // Focus dispatch early-returns while the intro flight is still running
    // (`CameraController.tsx`) — wait for it to end before dispatching, the
    // same gate `boot.spec.ts` / `hyg-focus.spec.ts` use.
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

    // One representative per patched material family (see file header).
    // Sequential, same page load, short settle each — curated-body fly-tos
    // cap at 4 s (`CameraController.tsx`'s `duration` clamp), well inside
    // this budget, and the recipient's own `onBeforeCompile` fires on the
    // render immediately after it becomes the active mesh target, not
    // gated on the flight finishing.
    const bodies = ["moon", "io", "mercury", "earth", "saturn"] as const;
    for (const bodyId of bodies) {
      await page.evaluate((id) => {
        const w = window as unknown as {
          __ATLAS_TEST_STORE__: {
            getState: () => { setFocusId: (id: string | null) => void };
          };
        };
        w.__ATLAS_TEST_STORE__.getState().setFocusId(id);
      }, bodyId);
      await page.waitForTimeout(2_500);
    }

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
