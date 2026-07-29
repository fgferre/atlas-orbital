import { expect, test } from "@playwright/test";

import {
  freezeSimulation,
  pageHasSizedCanvas,
  visitAtlasAndWaitForReady,
  waitForStableFrame,
} from "./helpers";

test.describe("boot", () => {
  // The visual-identity spec below waits ~85 s in the worst case
  // (20 s visitAtlasAndWaitForReady budget + 55 s atlas-loader exit
  // budget + 1 s lerp settle + browser context setup + screenshot
  // comparison). T5.6 + T5.7 diag (2026-04-24): the loader reaches
  // pct=100 within ~14 s on current HEAD (T5.7 fix broke the 18 s
  // displayProgress stall) but the AnimatePresence fade + exit
  // delay are still rAF-throttled by main-thread post-ready work
  // (R3F scene init, shader compiles), pushing total loader-gone
  // to ~40 s ± 10 s variance. 55 s toHaveCount timeout absorbs
  // this variance with 15 s headroom.
  //
  // N-9 follow-up (2026-07-23): the previously committed snapshot was a
  // white/grey WebGL-failure frame with only the HTML UI and SUN label. It was
  // replaced only after visually inspecting a populated starfield produced by
  // the camera-driven streaming build. This gate must never be updated from a
  // failing or blank render merely to make the pixel assertion green.
  test.setTimeout(100_000);

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

  // Wave α smoke gate: screenshot the boot frame with the simulation
  // clock frozen and compare against a committed baseline. Tolerance is
  // set to 1 % (`maxDiffPixelRatio: 0.01`) because R3F's
  // `frameloop="always"` + GPU rasterization non-determinism make
  // tighter pixel-level equality unreliable across runs even on byte-
  // identical render math. The rigorous identity gate for the Wave 0
  // lerp refactor is `visualPresetOverrides.test.ts` — a pure-function
  // equality check, stricter than any pixel-diff. This screenshot only
  // catches gross regressions (a whole planet moves, a color palette
  // collapses, a post-processing effect unmounts).
  //
  // We use `toMatchSnapshot(buffer)` instead of `toHaveScreenshot`
  // because Playwright's built-in stability retry requires bit-exact
  // stability between back-to-back screenshots, which R3F never
  // delivers. `toMatchSnapshot` is a single-shot comparison against
  // the committed baseline; the wait chain below lets the scene
  // settle into a deterministic post-boot state.
  //
  // **T5.6 (2026-04-24)** — pre-T5.6 this used a flat
  // `waitForTimeout(3500)` which captured mid-loader on current HEAD
  // (the loader takes longer to exit after T5.1/T5.2/T5.3b shader
  // compiles + T4.4 grid shader compile + SurfaceModeFirstPerson
  // mount). The baseline and the actual render ended up at different
  // boot phases → 88 % pixel diff on a correctly-behaving scene.
  // Replaced the flat timeout with a deterministic wait chain:
  //   1. Loader exits (`"Initializing Simulation"` text gone, same
  //      gate as the sibling "no console errors" test at :39).
  //   2. Intro animation settles — `INTRO_DURATION_MS = 12000` in
  //      `InitialCameraAnimation.tsx:11`, so a 13 s ceiling on the
  //      loader-exit poll gives headroom.
  //   3. `waitForStableFrame` polls until the frame stops changing
  //      (replaces the pre-T5.6 3500 ms flat wait, and then the 1000 ms
  //      one that followed it).
  //
  // **θ.2 (2026-07-28)** — that 1000 ms settle was not enough and no
  // fixed number was the right answer. Measured, sim frozen, 1280×720:
  //
  //   • WITHIN one page: +2 s → 17.8 % of pixels still changing frame
  //     to frame, +4 s → 0.012 %, flat out to +16 s. That residual
  //     floor is LightGlow's wall-clock polar-mask animation, which
  //     never settles and sits two orders of magnitude under the gate.
  //   • ACROSS page loads, which is what this gate actually compares:
  //     +4 s → 16.7 % different, +8 s → 0 pixels different on the dev
  //     server. The camera is damped, so two boots reach
  //     visually-static-but-different poses well before they converge
  //     on the same one — a within-page stability check would have
  //     passed at +4 s and the gate would still have been flaky.
  //   • The production build then settled on a different schedule again
  //     and +8 s failed at 4 %, which is what retired fixed timings
  //     here for good.
  //
  // The race was always here; it only became visible when the θ.2 star
  // field stopped being sparse and dim. The old renderer put 97.5 % of
  // stars on the same 3.75 px quad at low opacity, so a mid-settle
  // camera still produced a near-identical frame. A dense field with
  // real size hierarchy does not, and the gate started failing at 3 %
  // against a 1 % tolerance on a scene rendering perfectly. Waiting
  // for actual convergence is the fix; loosening the tolerance would
  // have hidden the race instead.
  test("boot visual identity (frozen sim)", async ({ page }) => {
    await freezeSimulation(page);
    await visitAtlasAndWaitForReady(page);
    // Wait for the full-screen loader overlay (`Loader.tsx`
    // `<motion.div data-testid="atlas-loader">`) to be removed from
    // the DOM. `AnimatePresence` unmounts it after the 1 s exit
    // animation once `isLoaderHidden` flips true (i.e., after
    // critical-assets gate + scene-ready signal). Give 15 s headroom
    // to cover the 12 s `INTRO_DURATION_MS` + the 1 s exit animation
    // + the `SceneReadyChecker` safety-hatch ceiling at 8 s.
    await expect(page.getByTestId("atlas-loader")).toHaveCount(0, {
      timeout: 55_000,
    });
    // Wait for the intro flight to END before polling for a stable
    // frame. The θ.2 starfield made this gate necessary: the intro
    // starts ~5 kpc from the origin, and under real Pogson photometry
    // the whole HYG catalog is genuinely invisible from there (the
    // retired renderer's solid-angle floor kept stars visible from
    // anywhere). Early intro is therefore a near-black sky moving
    // slowly — two frames 750 ms apart differ by less than the
    // convergence tolerance, the poll latches, and the gate captures a
    // mid-intro frame that the standing order above forbids blessing.
    // `isIntroAnimating` is the same store gate `hyg-focus.spec.ts`
    // waits on; the hook exists whenever `__ATLAS_TEST_FREEZE__` is
    // set, which `freezeSimulation` did above.
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
    // Poll until the frame stops changing, rather than guessing how
    // long convergence takes on this machine and this build.
    const screenshot = await waitForStableFrame(page);
    expect(screenshot).toMatchSnapshot("boot-frozen.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
