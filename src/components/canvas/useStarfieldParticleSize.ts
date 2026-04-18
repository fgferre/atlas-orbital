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
 * Recomputed on resize (because `useThree` returns fresh `size` on
 * viewport change). Stable across frames in between — consumers should
 * close over the returned number inside `useFrame` and mutate the
 * material's `particleSize` uniform accordingly.
 */
export const useStarfieldParticleSize = (): number => {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const effectiveDpr = gl.getPixelRatio();
  return Math.sqrt(Math.max(size.width, size.height) * effectiveDpr) / 60;
};
