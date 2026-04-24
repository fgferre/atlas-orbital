import { useFrame, useThree } from "@react-three/fiber";
import { canMarkSceneReady } from "../../lib/sceneReadiness";
import { useStore } from "../../store";
import { useEffect, useRef } from "react";

/**
 * Safety hatch (added 2026-04-23 after a 96 %-loader-hang report).
 *
 * If the R3F frame loop crashes for any reason (a useFrame in another
 * component throws, the WebGL context is lost during boot, etc.),
 * SceneReadyChecker's per-frame counter never advances and the loader
 * stays stuck at 96 % forever (`loaderStages.ts:136` clamps the
 * "render" stage to `[88, 96]`; only `isSceneReady === true` lifts
 * the cap to 100). This timeout fires `setSceneReady(true)` from a
 * regular `setTimeout` after `criticalAssetsReady` has been true for
 * SCENE_READY_FALLBACK_MS, so the user always sees the scene
 * eventually — even if the canvas itself failed to start frames.
 *
 * Tuned to 8 s: long enough to give the per-frame counter the
 * normal 6 frames @ 60 Hz (~100 ms) plus a generous slack for slow
 * GPUs / first-paint stalls; short enough that a failed boot
 * surfaces quickly instead of leaving the user staring at the
 * progress dial.
 */
const SCENE_READY_FALLBACK_MS = 8_000;

export const SceneReadyChecker = () => {
  const setSceneReady = useStore((state) => state.setSceneReady);
  const criticalAssetsReady = useStore((state) => state.criticalAssetsReady);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const frameCount = useRef(0);
  const hasMarkedReady = useRef(false);

  // We wait for a few frames to ensure the GPU is actually pushing pixels
  // and the heavy assets (like textures) are fully uploaded and displayed.
  useFrame(() => {
    if (hasMarkedReady.current) return;
    if (!criticalAssetsReady) return;

    if (!canMarkSceneReady(criticalAssetsReady, frameCount.current)) {
      frameCount.current += 1;
    } else {
      hasMarkedReady.current = true;
      // **T5.8 (2026-04-24) — second compileAsync at scene-ready edge**.
      // The initial call at `criticalAssetsReady` flip (inside the
      // useEffect below) only catches materials present in the scene
      // graph at that moment. atlas's Scene.tsx has Suspense
      // boundaries around `ProceduralSun3D`, `SolarSystem`, and the
      // post-processing pipeline — their child materials mount
      // AFTER the initial compileAsync call, so they'd compile
      // lazily on first render absent a second pre-warm pass. This
      // final call happens in the 6-frame window immediately before
      // `setSceneReady(true)` fires, when all Suspense resolutions
      // have committed.
      if (typeof gl.compileAsync === "function") {
        gl.compileAsync(scene, camera).catch((err: unknown) => {
          if (typeof console !== "undefined") {
            console.warn(
              "[SceneReadyChecker] compileAsync (scene-ready edge) failed:",
              err
            );
          }
        });
      }
      setSceneReady(true);
    }
  });

  useEffect(() => {
    frameCount.current = 0;
    hasMarkedReady.current = false;
    setSceneReady(false);

    if (!criticalAssetsReady) {
      return () => setSceneReady(false);
    }

    // **T5.8 (2026-04-24) — preemptive shader warm-up**. `compileAsync`
    // runs `gl.compile(scene, camera)` synchronously to collect the
    // set of materials whose programs aren't yet linked, then returns
    // a Promise that resolves when all of them finish linking. On
    // WebGL 2 with the `KHR_parallel_shader_compile` extension
    // available (modern Chrome + NVIDIA/AMD/Intel/Apple GPUs), the
    // compile + link happens on a separate GPU-driver thread — the
    // synchronous `gl.compile(...)` call inside `compileAsync` is
    // cheap (just collects + starts compile), and the main thread
    // keeps running while shaders link in parallel.
    //
    // Pre-T5.8: materials compiled lazily on first render use,
    // piling the compile cost into the post-scene-ready frames. The
    // T5.7 dense-timeline diag measured ~18 s of main-thread busy-
    // time after `isSceneReady` flipped true, entirely consumed by
    // lazy shader compiles + first paint.
    //
    // Post-T5.8: we kick off `compileAsync` the moment
    // `criticalAssetsReady` flips true (same edge as the safety
    // hatch timer). While the 6-frame warm-up + potential 8 s
    // safety hatch wait run, the GPU driver compiles programs in
    // parallel. By the time `isSceneReady` flips, most programs
    // ARE ready → post-scene-ready render frames don't stall on
    // lazy compiles → rAF + setTimeout callbacks fire on schedule.
    //
    // Fire-and-forget: we don't `await` the promise or gate
    // `setSceneReady(true)` on its completion. A parallel compile
    // that takes longer than the frame counter / safety hatch
    // would only worsen boot time; best effort only.
    //
    // `compileAsync` is a Three.js r155+ API. Guard with a typeof
    // check so atlas still boots on older Three versions without
    // crashing (unused atlas currently; safety for future downgrade).
    if (typeof gl.compileAsync === "function") {
      gl.compileAsync(scene, camera).catch((err: unknown) => {
        if (typeof console !== "undefined") {
          console.warn("[SceneReadyChecker] compileAsync failed:", err);
        }
      });
    }

    // Safety hatch — force ready after the fallback window so the
    // loader never hangs at 96 % even if the frame loop is dead.
    const timeoutId = window.setTimeout(() => {
      if (!hasMarkedReady.current) {
        hasMarkedReady.current = true;
        setSceneReady(true);
        if (typeof console !== "undefined") {
          console.warn(
            `[SceneReadyChecker] Scene-ready fallback fired after ${SCENE_READY_FALLBACK_MS} ms — frame loop may not be running. Loader exiting anyway.`
          );
        }
      }
    }, SCENE_READY_FALLBACK_MS);

    return () => {
      window.clearTimeout(timeoutId);
      setSceneReady(false);
    };
  }, [criticalAssetsReady, setSceneReady, gl, scene, camera]);

  return null;
};
