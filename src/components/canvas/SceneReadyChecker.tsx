import { useFrame } from "@react-three/fiber";
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
  }, [criticalAssetsReady, setSceneReady]);

  return null;
};
