/**
 * T6.4-M2.5 — pure solid-angle math for HYG fly-to.
 *
 * Ports two contracts from Gaia Sky's `CameraModule.java` /
 * `InteractiveCameraModule.java` (clone at `/tmp/gaiasky/`,
 * verified 2026-05-05):
 *
 *   1. `computeTargetSolidAngleRad(distancePc)` — adaptive
 *      apparent-size target for catalog stars. Linear lerp from
 *      `1.0° at 1.31 pc` to `0.001° at 2805 pc`. Source:
 *      `gaiasky/script/v2/impl/InteractiveCameraModule.java:158-168`.
 *      The lerp tracks Gaia's intuition that close stars deserve a
 *      visible disc on screen while far stars must not be inflated
 *      to absurd sizes — without this, near and far stars all land
 *      at the same fixed gate margin (Atlas pre-M2.5 used
 *      `STELLAR_MESH_ENTER_RAD * 5` ≈ 0.286° for everything).
 *
 *   2. `computeFlightTargetDistance(radiusWu, targetSolidAngleRad)`
 *      — distance such that a sphere of `radiusWu` subtends
 *      `targetSolidAngleRad` at the camera. Source:
 *      `gaiasky/script/v2/impl/CameraModule.java:665`:
 *      `targetDistance = radius / FastMath.tan(targetAngle * 0.5)`.
 *
 * Both functions are pure: no `THREE.*` deps, no I/O. The camera
 * controller (M2.5 S4) composes them with the catalog's per-star
 * distance + radius to compute fly-to landing positions.
 */

/** Closest-anchor distance in parsec for the adaptive lerp. */
const NEAR_ANCHOR_PC = 1.31;
/** Farthest-anchor distance in parsec for the adaptive lerp. */
const FAR_ANCHOR_PC = 2805.0;
/** Apparent size at NEAR_ANCHOR_PC, in degrees. */
const NEAR_TARGET_DEG = 1.0;
/** Apparent size at FAR_ANCHOR_PC, in degrees. */
const FAR_TARGET_DEG = 0.001;

const DEG_TO_RAD = Math.PI / 180;

const NEAR_TARGET_RAD = NEAR_TARGET_DEG * DEG_TO_RAD;
const FAR_TARGET_RAD = FAR_TARGET_DEG * DEG_TO_RAD;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Target apparent angular size (radians) for a HYG-catalog star
 * at the given distance from the Sun. Linear lerp clamped at both
 * ends. Distance below `NEAR_ANCHOR_PC` clamps to the close-star
 * target; distance above `FAR_ANCHOR_PC` clamps to the far-star
 * target.
 *
 * Atlas-Gaia divergence (intentional): Gaia uses these same
 * anchors for ParticleSet-typed catalog focuses; Atlas applies
 * them to all HYG focus IDs since every HYG star is a particle
 * in our single-instanced starfield mesh. No type discrimination
 * needed at this layer.
 */
export const computeTargetSolidAngleRad = (
  starDistanceFromSunPc: number
): number => {
  if (!Number.isFinite(starDistanceFromSunPc)) {
    return NEAR_TARGET_RAD;
  }
  const t = clamp01(
    (starDistanceFromSunPc - NEAR_ANCHOR_PC) / (FAR_ANCHOR_PC - NEAR_ANCHOR_PC)
  );
  return NEAR_TARGET_RAD + (FAR_TARGET_RAD - NEAR_TARGET_RAD) * t;
};

/**
 * Camera-to-star distance (atlas world units) such that a sphere
 * of `radiusWorldUnits` subtends `targetSolidAngleRad` at the
 * camera. Standard small-angle pinhole math; not Gaia-specific
 * but matches Gaia's formula at line 665 of `CameraModule.java`.
 *
 * Returns `Infinity` for degenerate inputs (zero radius or zero
 * angle); callers in M2.5 should clamp via the body-clearance
 * floor (`radius * 1.1`).
 */
export const computeFlightTargetDistance = (
  radiusWorldUnits: number,
  targetSolidAngleRad: number
): number => {
  if (
    !Number.isFinite(radiusWorldUnits) ||
    !Number.isFinite(targetSolidAngleRad) ||
    radiusWorldUnits <= 0 ||
    targetSolidAngleRad <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return radiusWorldUnits / Math.tan(targetSolidAngleRad * 0.5);
};

/**
 * Convenience: compose the two functions for the typical HYG
 * focus path. `radiusWorldUnits` is `radiusFromSpect(...) *
 * SUN_RADIUS_WORLD_UNITS`; `starDistanceFromSunPc` is the
 * catalog's per-star distance from origin (computed from raw
 * parsec positions in `HygCatalogData.positions`).
 *
 * Returns the landing distance the camera should target. Callers
 * apply the body-clearance floor (`Math.max(radiusWu * 1.1,
 * landingDist)`) before using the value, since the pure
 * formula can return values smaller than the star itself for
 * compact objects.
 */
export const computeStellarLandingDistance = (
  radiusWorldUnits: number,
  starDistanceFromSunPc: number
): number => {
  const targetAngle = computeTargetSolidAngleRad(starDistanceFromSunPc);
  return computeFlightTargetDistance(radiusWorldUnits, targetAngle);
};

/**
 * Anchor constants exported for tests + diagnostic logging in
 * the camera controller (so the contract is greppable from any
 * call site without reaching into private symbols).
 */
export const STELLAR_FLIGHT_ANCHORS = {
  NEAR_ANCHOR_PC,
  FAR_ANCHOR_PC,
  NEAR_TARGET_DEG,
  FAR_TARGET_DEG,
  NEAR_TARGET_RAD,
  FAR_TARGET_RAD,
} as const;
