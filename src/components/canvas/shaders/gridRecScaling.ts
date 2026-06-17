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

/**
 * World radius of the first BRIGHT level-1 `circle_rec` ring when
 * `u_tessQuality = 1`. The shader lights a ring where `cos(π · dist) = 1`
 * — i.e. at EVEN integer `dist` (2, 4, 6 …); ODD `dist` (1, 3 …) is a
 * dark trough (`cos(π) = −1`, `gridRecShader.ts:150,171`). Here
 * `dist = length(tc · u_tessQuality · GRIDREC_CIRCLE_LEVEL1_F · GRIDREC_N · 2)`
 * and `tc` runs `[-1, 1]` across the plane, so a world radius `R` maps
 * to `tc = R / (worldSize / 2)` (`gridRecShader.ts:138-141`). Solving the
 * first bright ring (`dist = 2`) for `R` at `tessQuality = 1` gives
 * `R = (worldSize / 2) / (LEVEL1_F · N)`. A target ring radius `W` is then
 * locked by `u_tessQuality = baseRingRadius / W` so a body at `W` sits ON
 * that bright ring (see {@link getGridRecAuLockedScaling}).
 *
 * ⚠ The `dist = 2` anchor is load-bearing. Anchoring to `dist = 1`
 * (an extra `× 2` in the denominator → 100 wu) would pin the body to a
 * TROUGH — it would sit in the dark gap at HALF the radius of the nearest
 * visible ring (a constant 2× offset, both scale modes). The shader-
 * brightness test in `gridRecScaling.test.ts` guards this; the algebraic
 * `baseRingRadius / tessQuality === auToWorld` identity cannot (it holds
 * for both anchors).
 */
export const gridRecBaseRingWorldRadius = (
  worldSize: number,
  level1F: number,
  gridN: number
): number => worldSize / 2 / (level1F * gridN);

/**
 * AU-decade-locked variant of {@link getGridRecScaling}.
 *
 * **Why this exists.** The base `getGridRecScaling` is scale-invariant:
 * it emits a `tessQuality` normalized within whatever decade contains
 * the *raw camera distance*, so the rendered ring radius
 * (`baseRingRadius / tessQuality`) floats with the camera and is NOT
 * anchored to any fixed world position. That is the scale-lock bug —
 * in didactic mode the grid rings drift away from the planets, which
 * sit at compressed world radii via `AstroPhysics.auToWorld`. (In
 * realistic mode they only *appear* to agree at certain camera
 * distances because both pipelines are linear.) Feeding an
 * effective-AU into the scale-invariant walk does NOT fix this — the
 * output is still a camera-relative normalized ratio with no world
 * anchor.
 *
 * **What this does instead.** It pins the first BRIGHT level-1 ring (at
 * shader `dist=2`, where `cos(π·dist)=1`) to the world radius of the
 * AU-decade currently enclosing the camera's effective-AU position. The
 * caller supplies:
 *  - `effectiveAU` — the camera's position expressed in heliocentric
 *    AU (`AstroPhysics.worldToAu(camera.position.length(), scaleMode)`),
 *    so the decade is chosen in the same space the bodies live in;
 *  - `auToWorld` — `AstroPhysics.auToWorld(au, scaleMode)`, so the
 *    locked radius uses the EXACT transform the body positioner uses.
 *
 * The result locks `u_tessQuality` so that first bright ring sits
 * exactly at `auToWorld(10^decade)` — the world radius of a body at
 * `10^decade` AU. A planet at `10^decade` AU therefore sits on that
 * bright ring in BOTH modes, by construction. `heightScale` fades the
 * level-1 ring across the decade (1 at the lower bound, 0 at the
 * upper) using the effective-AU's position within the decade, exactly
 * like the base walk — so the decade swap stays smooth.
 *
 * **Saturated regime.** When the camera is past the didactic cap,
 * `worldToAu` returns the fixed saturation AU, so `effectiveAU` stops
 * advancing and the decade freezes — and `auToWorld(10^decade)` also
 * caps at 3200, so the ring freezes at the same radius the planets
 * freeze at. The lock holds; nothing NaNs, freezes mid-curve, or runs
 * away.
 */
export const getGridRecAuLockedScaling = (
  effectiveAU: number,
  auToWorld: (au: number) => number,
  baseRingRadius: number
): GridRecScalingResult => {
  // Guard non-finite / non-positive effective-AU (camera at origin,
  // bad invert). Fall back to the level-1 ring at full fade so the
  // grid still renders a sane innermost decade.
  if (!Number.isFinite(effectiveAU) || effectiveAU <= 0) {
    const fallbackWorld = auToWorld(1);
    return {
      tessQuality: fallbackWorld > 0 ? baseRingRadius / fallbackWorld : 1,
      heightScale: 1,
    };
  }

  const decade = Math.floor(Math.log10(effectiveAU));
  const decadeLowerAU = Math.pow(10, decade);
  const decadeUpperAU = Math.pow(10, decade + 1);

  // Lock the level-1 ring (k=1) to the world radius of the current
  // AU-decade boundary — the SAME world radius a body at 10^decade AU
  // is drawn at. tessQuality = baseRingRadius / lockedWorldRadius.
  const lockedWorldRadius = auToWorld(decadeLowerAU);
  const tessQuality =
    lockedWorldRadius > 0 ? baseRingRadius / lockedWorldRadius : 1;

  // Decade cross-fade: 1 at the decade's lower bound, 0 at its upper
  // bound, computed in the SAME AU space (mirrors the base walk's
  // gridRecLint over the enclosing decade).
  const heightScale = gridRecLint(
    effectiveAU,
    decadeLowerAU,
    decadeUpperAU,
    1,
    0
  );

  return { tessQuality, heightScale };
};
