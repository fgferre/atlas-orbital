/**
 * T6.4-M2.5 — angle math for HYG fly-to.
 *
 * Two-layer contract:
 *
 *   1. **Gaia-faithful layer** (`computeGaiaTargetFullAngleRad`):
 *      pure port of Gaia Sky's adaptive landing target. Linear lerp
 *      from `1.0° at 1.31 pc` to `0.001° at 2805 pc`. Returns the
 *      target FULL angle (apparent diameter) in radians. Source:
 *      `gaiasky/script/v2/impl/InteractiveCameraModule.java:158-168`
 *      (clone at `/tmp/gaiasky/`, verified 2026-05-05).
 *
 *   2. **Atlas-clamped layer** (`computeAtlasFlightTarget`): wraps
 *      the Gaia target with a floor at the procedural-mesh spawn
 *      gate. Atlas's `<HygStellarMesh>` only spawns when the focused
 *      star's apparent ANGULAR RADIUS exceeds `STELLAR_MESH_ENTER_RAD`
 *      (1e-3 rad ≈ 0.057° angular radius, see `stellarMeshGate.ts`).
 *      Without the clamp, far stars would land at the Gaia target
 *      (e.g. 0.001° full angle = 8.7e-6 rad angular radius at the
 *      far anchor), which falls FAR below the spawn gate — the
 *      camera would arrive correctly per Gaia but the procedural
 *      mesh would never render. The clamp ensures `angularRadiusRad
 *      ≥ STELLAR_MESH_ENTER_RAD × 5` (5× hysteresis margin matching
 *      `CameraController.tsx`'s pre-M2.5 contract).
 *
 * **Angle semantics — read this once before touching the lib**.
 * Three different angle conventions are in play and conflating them
 * is exactly how the M2.5 first-draft spec went wrong (Codex review,
 * 2026-05-05):
 *
 *   - **Full angle** (apparent diameter) — what Gaia's API takes.
 *     Used in the formula `distance = radius / tan(fullAngle * 0.5)`.
 *     `1.0°` at the near anchor means the star fills 1° of screen.
 *
 *   - **Angular radius** (apparent radius) — what Atlas's mesh-spawn
 *     gate uses (`STELLAR_MESH_ENTER_RAD = 1e-3 rad`). Equals
 *     half the full angle. The gate's per-frame value is computed
 *     as `sa = radiusWu / distanceWu` (small-angle approx; see
 *     `stellarMeshGate.ts:88-100`).
 *
 *   - **Solid angle** (sr) — area on the unit sphere. NOT used here
 *     despite the unfortunate `solidAngle` name in Gaia's source
 *     and in early Atlas drafts. Renamed away in this revision to
 *     prevent re-confusion.
 *
 * Function names use `FullAngle` and `AngularRadius` exclusively.
 * `solidAngle` is reserved for diagnostic comments referencing the
 * Gaia source (which uses the misnomer historically).
 */

import { STELLAR_MESH_ENTER_RAD } from "../stellarMeshGate";

/** Closest-anchor distance in parsec for the Gaia adaptive lerp. */
const NEAR_ANCHOR_PC = 1.31;
/** Farthest-anchor distance in parsec for the Gaia adaptive lerp. */
const FAR_ANCHOR_PC = 2805.0;
/** Apparent FULL angle (diameter) at NEAR_ANCHOR_PC, in degrees. */
const NEAR_TARGET_FULL_DEG = 1.0;
/** Apparent FULL angle (diameter) at FAR_ANCHOR_PC, in degrees. */
const FAR_TARGET_FULL_DEG = 0.001;

const DEG_TO_RAD = Math.PI / 180;

const NEAR_TARGET_FULL_RAD = NEAR_TARGET_FULL_DEG * DEG_TO_RAD;
const FAR_TARGET_FULL_RAD = FAR_TARGET_FULL_DEG * DEG_TO_RAD;

/**
 * Atlas mesh-spawn floor for the angular RADIUS (not full angle).
 * Set to 5× the spawn gate so the camera lands clear of the
 * hysteresis cushion (matches `CameraController.tsx`'s pre-M2.5
 * `STELLAR_MESH_ENTER_RAD * 5` contract).
 */
const ATLAS_MIN_ANGULAR_RADIUS_RAD = STELLAR_MESH_ENTER_RAD * 5;

/**
 * Absolute landing-distance floor in atlas world units. Mirrors
 * the pre-M2.5 `Math.max(10, ...)` guard in
 * `CameraController.tsx:277` (the original three-way max:
 * absolute floor, 5× radius, gate-driven). Without this, ultra-
 * compact stars (white dwarfs at ~0.0465 wu radius, neutron-
 * star-class hypotheticals) could land at single-digit world
 * units even though the angular-radius gate is satisfied — that
 * collapses `OrbitControls.minDistance` (set to `radius * 1.1`)
 * to sub-wu scale and pushes the perspective `near` plane into
 * the territory where z-buffer precision starts to matter.
 *
 * Codex 2026-05-05 P2 caught the silent drop. Re-introduced as
 * a named constant so the contract is visible in the lib and
 * any future scope change is explicit.
 */
export const ATLAS_MIN_LANDING_DISTANCE_WU = 10;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Gaia's adaptive target FULL angle (apparent diameter, radians)
 * for a HYG-catalog star at the given distance from the Sun.
 * Linear lerp clamped at both ends. NO Atlas-specific clamp
 * applied — use `computeAtlasFlightTarget` for the Atlas-safe
 * version.
 *
 * Edge cases (Codex 2026-05-05 P3 catch):
 *  - `+Infinity` → clamps to FAR target (not near). A star at
 *    "infinitely far" semantically belongs at the far anchor,
 *    not the near one. The pre-Codex draft mapped all non-finite
 *    inputs (including `+Infinity`) to NEAR via the
 *    `!Number.isFinite()` branch, which was backwards.
 *  - `-Infinity` and `NaN` → conservative default to NEAR. NaN
 *    represents "unknown" so falling back to the close-star
 *    target keeps the visual reasonable; `-Infinity` is
 *    nonsensical for a physical distance and gets the same
 *    defensive default.
 */
export const computeGaiaTargetFullAngleRad = (
  starDistanceFromSunPc: number
): number => {
  if (Number.isNaN(starDistanceFromSunPc)) {
    return NEAR_TARGET_FULL_RAD;
  }
  if (starDistanceFromSunPc === Number.POSITIVE_INFINITY) {
    return FAR_TARGET_FULL_RAD;
  }
  if (starDistanceFromSunPc === Number.NEGATIVE_INFINITY) {
    return NEAR_TARGET_FULL_RAD;
  }
  const t = clamp01(
    (starDistanceFromSunPc - NEAR_ANCHOR_PC) / (FAR_ANCHOR_PC - NEAR_ANCHOR_PC)
  );
  return (
    NEAR_TARGET_FULL_RAD + (FAR_TARGET_FULL_RAD - NEAR_TARGET_FULL_RAD) * t
  );
};

/**
 * Result of the Atlas flight-target computation, with diagnostic
 * fields so callers can log which clamp dominated.
 */
export interface AtlasFlightTarget {
  /** FULL angle (apparent diameter) used for the distance formula. */
  fullAngleRad: number;
  /** Angular RADIUS (= fullAngleRad / 2). Cached for callers that
   *  need to compare against the mesh-spawn gate directly. */
  angularRadiusRad: number;
  /** True when the Atlas mesh-spawn floor dominated (i.e. Gaia's
   *  target alone would have fallen below the spawn gate). */
  clampedByAtlasFloor: boolean;
}

/**
 * Atlas-safe target apparent size for a HYG fly-to. Returns the
 * Gaia adaptive target clamped to ensure the camera lands above
 * the procedural-mesh spawn gate (`STELLAR_MESH_ENTER_RAD × 5`
 * in angular RADIUS terms).
 *
 * Crossover point is around 1200 pc: at that distance Gaia's
 * adaptive target equals the Atlas floor. Closer than 1200 pc,
 * the camera lands per Gaia (smaller target, closer landing).
 * Beyond 1200 pc, the camera lands per the Atlas floor (so the
 * procedural mesh always spawns on arrival).
 */
export const computeAtlasFlightTarget = (
  starDistanceFromSunPc: number
): AtlasFlightTarget => {
  const gaiaFullRad = computeGaiaTargetFullAngleRad(starDistanceFromSunPc);
  const gaiaAngularRadiusRad = gaiaFullRad * 0.5;
  const clampedByAtlasFloor =
    gaiaAngularRadiusRad < ATLAS_MIN_ANGULAR_RADIUS_RAD;
  const angularRadiusRad = clampedByAtlasFloor
    ? ATLAS_MIN_ANGULAR_RADIUS_RAD
    : gaiaAngularRadiusRad;
  return {
    fullAngleRad: angularRadiusRad * 2,
    angularRadiusRad,
    clampedByAtlasFloor,
  };
};

/**
 * Camera-to-star distance (atlas world units) such that a sphere
 * of `radiusWorldUnits` subtends the given FULL angle at the
 * camera. Standard small-angle pinhole math; matches Gaia's
 * formula at `CameraModule.java:665`.
 *
 * Returns `Infinity` for degenerate inputs (zero radius or zero
 * angle); callers should clamp via the body-clearance floor
 * (`radius * 1.1`).
 */
export const computeFlightTargetDistance = (
  radiusWorldUnits: number,
  fullAngleRad: number
): number => {
  if (
    !Number.isFinite(radiusWorldUnits) ||
    !Number.isFinite(fullAngleRad) ||
    radiusWorldUnits <= 0 ||
    fullAngleRad <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return radiusWorldUnits / Math.tan(fullAngleRad * 0.5);
};

/**
 * Convenience: full Atlas flight composition. Computes the
 * Gaia-adaptive target, applies the Atlas mesh-spawn floor, and
 * returns the camera landing distance plus diagnostic info.
 *
 * Three-way `Math.max` over:
 *   - `radiusWorldUnits * 1.1` (body-clearance: never inside the
 *     star's surface, with 10% margin for the OrbitControls
 *     `minDistance` floor)
 *   - `ATLAS_MIN_LANDING_DISTANCE_WU` (absolute floor, mirrors
 *     pre-M2.5 `CameraController.tsx`'s `Math.max(10, ...)`
 *     guard — protects ultra-compact stars from collapsing
 *     `near`-plane precision)
 *   - `computeFlightTargetDistance(radius, target.fullAngleRad)`
 *     (the angle-driven landing — the actual cinematic distance
 *     for typical stars)
 *
 * For most catalog stars the angle-driven term dominates. For
 * white-dwarf-class radii (~0.0465 wu) the absolute 10 wu floor
 * kicks in — same behavior as pre-M2.5.
 *
 * The camera controller (M2.5 S4) consumes this directly.
 */
export const computeAtlasFlightLanding = (
  radiusWorldUnits: number,
  starDistanceFromSunPc: number
): {
  distanceWu: number;
  target: AtlasFlightTarget;
} => {
  const target = computeAtlasFlightTarget(starDistanceFromSunPc);
  const angleDriven = computeFlightTargetDistance(
    radiusWorldUnits,
    target.fullAngleRad
  );
  const bodyClearance =
    Number.isFinite(radiusWorldUnits) && radiusWorldUnits > 0
      ? radiusWorldUnits * 1.1
      : 0;
  const distanceWu = Math.max(
    bodyClearance,
    ATLAS_MIN_LANDING_DISTANCE_WU,
    angleDriven
  );
  return { distanceWu, target };
};

/**
 * Anchor + clamp constants exported for tests + diagnostic logging
 * in the camera controller (so the contract is greppable from any
 * call site without reaching into private symbols).
 */
export const STELLAR_FLIGHT_ANCHORS = {
  NEAR_ANCHOR_PC,
  FAR_ANCHOR_PC,
  NEAR_TARGET_FULL_DEG,
  FAR_TARGET_FULL_DEG,
  NEAR_TARGET_FULL_RAD,
  FAR_TARGET_FULL_RAD,
  ATLAS_MIN_ANGULAR_RADIUS_RAD,
} as const;
