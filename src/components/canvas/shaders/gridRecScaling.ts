/**
 * Pure-TS port of `/tmp/gaiasky/core/src/gaiasky/scene/system/update/GridRecUpdater.java`'s
 * `getGridScaling(cameraDistance, res)` (MPL-2.0, lines 148-160) —
 * the per-frame driver that turns a camera-distance scalar into the
 * two `uniforms` the recursive grid shader reads:
 *   - `u_tessQuality` (the "level-1 ring frequency" multiplier)
 *   - `u_heightScale` (the "level-1 → level-2 fade factor")
 *
 * The recursion works by finding the smallest power of 10 (the
 * **decade**) that still contains the camera distance, then:
 *   - normalizing the distance into `[0.1, 1.0]` within that decade
 *     (so level-1 rings sit at 1 / 10 / 100 / ... world units as
 *     the camera pulls back);
 *   - linearly interpolating a fade from `1.0` at the decade's lower
 *     bound down to `0.0` at its upper bound, so the level-1 rings
 *     smoothly swap in / out when the camera crosses a decade line.
 *
 * **Scale invariance.** Gaia's source converts `cameraDistance`
 * (internal units) to `au` via `U_TO_AU` before the walk; the walk
 * itself is scale-invariant — the output pair `(tessQuality,
 * heightScale)` is identical whether the caller feeds atlas world
 * units, astronomical units, or any other linear scale, because both
 * outputs are ratios normalized against the enclosing decade. The
 * specific decade index `i` shifts with the unit choice, but the
 * shader never reads `i`. Atlas therefore feeds
 * `camera.position.length()` (world units) directly — no
 * `AU_TO_3D_UNITS` conversion needed. If a future sub-wave exposes
 * the decade index as a label (axis tick callouts, etc), we'll
 * introduce the AU conversion then.
 *
 * Gaia's decade search spans `[-25, 25]` which covers ~5e-26 AU to
 * 1e25 AU — far beyond any physically-meaningful distance. Atlas
 * ships the same range for 1:1 parity.
 */

export interface GridRecScalingResult {
  /** `u_tessQuality` — camera-distance normalized within the enclosing decade. */
  tessQuality: number;
  /** `u_heightScale` — 1.0 at decade lower bound, 0.0 at upper bound. */
  heightScale: number;
}

export const GRID_REC_DECADE_MIN = -25;
export const GRID_REC_DECADE_MAX = 25;

/**
 * Linear interpolation mirroring Gaia's
 * `gaiasky.util.math.MathUtilsDouble.lint(val, min, max, startOut, endOut)` —
 * maps `val ∈ [min, max]` onto `[startOut, endOut]` with no clamping
 * (callers rely on the `val < pow(10, i)` gate above to keep `val`
 * inside the range, so no clamp is defensive-only).
 */
export const gridRecLint = (
  val: number,
  min: number,
  max: number,
  startOut: number,
  endOut: number
): number => startOut + ((val - min) * (endOut - startOut)) / (max - min);

/**
 * Port of `GridRecUpdater.java:148-160`. Caller passes camera
 * distance in any linear unit (atlas world units work; see JSDoc
 * for why the choice of unit doesn't affect the output).
 *
 * Fallback contract (Gaia `res.set(au, 0d)` at line 150):
 *   if the distance is so large it exceeds every decade in the
 *   search range, `tessQuality = cameraDistance` and `heightScale
 *   = 0`. That's Gaia's own behavior — porting 1:1 rather than
 *   second-guessing.
 */
export const getGridRecScaling = (
  cameraDistance: number
): GridRecScalingResult => {
  // Default return matches Gaia's `res.set(au, 0d)` pre-loop init.
  let tessQuality = cameraDistance;
  let heightScale = 0;

  for (let i = GRID_REC_DECADE_MIN; i < GRID_REC_DECADE_MAX; i++) {
    const upper = Math.pow(10, i);
    if (cameraDistance < upper) {
      const lower = Math.pow(10, i - 1);
      heightScale = gridRecLint(cameraDistance, lower, upper, 1, 0);
      tessQuality = cameraDistance * Math.pow(10, -i);
      return { tessQuality, heightScale };
    }
  }

  return { tessQuality, heightScale };
};
