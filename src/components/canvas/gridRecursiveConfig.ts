/**
 * Layout + opacity-fade constants shared by `GridRecursive.tsx` and
 * its test bench. Lives in its own module so `GridRecursive.tsx` can
 * stay pure-component (React Fast Refresh enforces the
 * `react-refresh/only-export-components` rule on files that export
 * components).
 */

export const GRID_RECURSIVE_CONFIG = {
  worldSize: 40000,
  planeYOffset: -0.15,
  renderOrder: -100,
  opacityFadeStart: 10000,
  opacityFadeEnd: 140000,
  opacityClose: 0.32,
  opacityFar: 0.0,
} as const;
