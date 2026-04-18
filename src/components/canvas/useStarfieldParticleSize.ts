import { useCallback } from "react";
import { useThree } from "@react-three/fiber";

/**
 * NASA Eyes' viewport-adaptive sprite scalar, shared between
 * `Starfield.tsx` and `NASAStarfield.tsx`.
 *
 *   scale = sqrt(max(width, height) * DPR) / 60
 *
 * Uses the renderer's effective DPR (`gl.getPixelRatio()`), which
 * already has `qualityProfile.dprMax` applied in `Scene.tsx`. Feeding
 * `window.devicePixelRatio` here would oversize sprites by
 * `sqrt(DPR_window / DPR_renderer)` on the constrained tier.
 *
 * Returns a **getter**, not a snapshot. Rationale: `<Canvas dpr={...}>`
 * in `Scene.tsx` drives DPR transitions (quality profile changes,
 * auto-tier re-classification) by mutating the renderer's pixel ratio
 * without changing the `gl` object identity or `size`. A render-time
 * snapshot would go stale on those transitions until some unrelated
 * rerender happened, leaving sprites mis-sized after the exact
 * calibration event this helper is supposed to centralize. Reading
 * `gl.getPixelRatio()` per-frame inside `useFrame` mirrors the
 * pre-extraction behaviour and keeps the scale always-live.
 *
 * The returned callback's identity is stable for a given `(gl, size)`
 * pair — consumers close over it inside `useFrame` and invoke it each
 * tick to mutate the material's `particleSize` uniform.
 */
export const useStarfieldParticleSize = (): (() => number) => {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  return useCallback(() => {
    const effectiveDpr = gl.getPixelRatio();
    return Math.sqrt(Math.max(size.width, size.height) * effectiveDpr) / 60;
  }, [gl, size]);
};
