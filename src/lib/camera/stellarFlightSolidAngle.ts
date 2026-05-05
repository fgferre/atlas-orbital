/**
 * T6.4-M2.5 — angle math for HYG fly-to (post Codex round-3 hotfix,
 * 2026-05-05).
 *
 * Two-layer contract:
 *
 *   1. **Gaia-informed layer** (`computeGaiaTargetAngularRadiusRad`):
 *      ports Gaia Sky's adaptive landing target verbatim — linear
 *      lerp from `1.0° at 1.31 pc` to `0.001° at 2805 pc`. Source:
 *      `gaiasky/script/v2/impl/InteractiveCameraModule.java:158-172`
 *      (clone at `/tmp/gaiasky/`, verified 2026-05-05). Returns the
 *      target ANGULAR RADIUS in radians — see "Why angular radius,
 *      not full angle" below.
 *
 *   2. **Atlas-clamped layer** (`computeAtlasFlightTarget`): wraps
 *      the Gaia target with a floor at the procedural-mesh spawn
 *      gate. Atlas's `<HygStellarMesh>` only spawns when the focused
 *      star's apparent ANGULAR RADIUS exceeds `STELLAR_MESH_ENTER_RAD`
 *      (1e-3 rad ≈ 0.057°, see `stellarMeshGate.ts`). Without the
 *      clamp, far stars would land at the Gaia target (e.g. 0.001°
 *      = 1.7e-5 rad at the far anchor), which falls FAR below the
 *      spawn gate — the camera would arrive correctly per Gaia but
 *      the procedural mesh would never render. The clamp ensures
 *      `angularRadiusRad ≥ STELLAR_MESH_ENTER_RAD × 5` (5×
 *      hysteresis margin matching `CameraController.tsx`'s pre-M2.5
 *      contract).
 *
 * **Why angular radius, not full angle** (Codex round-3 P1, 2026-05-05).
 * Gaia's `focusView.getSolidAngle()` returns `(radius / distance) /
 * fovFactor` (`ParticleSet.java:809`). Despite the misleading
 * "solidAngle" name (steradians is what the term technically means),
 * the formula is the small-angle approximation of an ANGULAR RADIUS,
 * normalised by `camera.getFovFactor()`. The y0/y1 anchors (1.0°,
 * 0.001°) are compared directly against this return value at
 * `InteractiveCameraModule.java:172` (`focusView.getSolidAngle() <
 * target`), so they ALSO live in angular-radius units — not full
 * angle (apparent diameter).
 *
 * The first-draft of this lib (M2.5 S1) treated the y0/y1 anchors as
 * full angle and halved them to derive angular radius. That was a
 * 2× regression: Sirius landed at ~913 wu instead of ~458 wu.
 * Codex round-3 caught it; this revision drops the halving step and
 * renames every symbol to make the angular-radius semantics
 * unambiguous.
 *
 * **fovFactor divergence** (Codex round-3 header note). Gaia
 * normalises `getSolidAngle()` by `camera.getFovFactor()`. For Gaia's
 * default 60° fov, fovFactor ≈ 1, so the divergence is small at
 * typical fov. Atlas does NOT replicate this normalisation — the
 * Gaia anchor values are baked in directly. If Atlas ever moves the
 * default fov off 45°, or exposes a runtime fov slider, revisit
 * this lib so the math doesn't silently drift.
 *
 * **Pseudo-size vs physical radius divergence**. Gaia's `getRadius()`
 * for stars returns `size × STAR_SIZE_FACTOR` (`ParticleSet.java:785`,
 * `Constants.java:51`), where `size` is a pseudo-size with no
 * physical meaning (see `feedback_pseudo_size_not_physical_radius.md`).
 * Atlas uses the actual physical radius from `radiusFromSpect`. So
 * Atlas reuses Gaia's NUMERIC anchor curve (1.0° → 0.001° lerp) but
 * applies it to a different radius convention. This is why the lib
 * is labeled "Gaia-informed" rather than "Gaia-faithful" or "Gaia
 * port" — the visual outcome is qualitatively Gaia-like but not
 * pixel-equivalent.
 */

import { STELLAR_MESH_ENTER_RAD } from "../stellarMeshGate";

/** Closest-anchor distance in parsec for the Gaia adaptive lerp. */
const NEAR_ANCHOR_PC = 1.31;
/** Farthest-anchor distance in parsec for the Gaia adaptive lerp. */
const FAR_ANCHOR_PC = 2805.0;
/** Apparent ANGULAR RADIUS at NEAR_ANCHOR_PC, in degrees. */
const NEAR_TARGET_RADIUS_DEG = 1.0;
/** Apparent ANGULAR RADIUS at FAR_ANCHOR_PC, in degrees. */
const FAR_TARGET_RADIUS_DEG = 0.001;

const DEG_TO_RAD = Math.PI / 180;

const NEAR_TARGET_RADIUS_RAD = NEAR_TARGET_RADIUS_DEG * DEG_TO_RAD;
const FAR_TARGET_RADIUS_RAD = FAR_TARGET_RADIUS_DEG * DEG_TO_RAD;

/**
 * Atlas mesh-spawn floor for the angular RADIUS. Set to 5× the
 * spawn gate so the camera lands clear of the hysteresis cushion
 * (matches `CameraController.tsx`'s pre-M2.5 `STELLAR_MESH_ENTER_RAD
 * * 5` contract).
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
 * Gaia's adaptive target ANGULAR RADIUS (radians) for a HYG-catalog
 * star at the given distance from the Sun. Linear lerp clamped at
 * both ends. NO Atlas-specific clamp applied — use
 * `computeAtlasFlightTarget` for the Atlas-safe version.
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
export const computeGaiaTargetAngularRadiusRad = (
  starDistanceFromSunPc: number
): number => {
  if (Number.isNaN(starDistanceFromSunPc)) {
    return NEAR_TARGET_RADIUS_RAD;
  }
  if (starDistanceFromSunPc === Number.POSITIVE_INFINITY) {
    return FAR_TARGET_RADIUS_RAD;
  }
  if (starDistanceFromSunPc === Number.NEGATIVE_INFINITY) {
    return NEAR_TARGET_RADIUS_RAD;
  }
  const t = clamp01(
    (starDistanceFromSunPc - NEAR_ANCHOR_PC) / (FAR_ANCHOR_PC - NEAR_ANCHOR_PC)
  );
  return (
    NEAR_TARGET_RADIUS_RAD +
    (FAR_TARGET_RADIUS_RAD - NEAR_TARGET_RADIUS_RAD) * t
  );
};

/**
 * Result of the Atlas flight-target computation, with diagnostic
 * fields so callers can log which clamp dominated.
 */
export interface AtlasFlightTarget {
  /** Angular RADIUS used for the distance formula. Equals
   *  `radius / tan(angularRadiusRad)` invariant — see
   *  `computeFlightTargetDistance`. */
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
 * Crossover point is around 2003 pc: below it, Gaia's adaptive
 * angular radius dominates (camera lands per Gaia, closer for
 * close stars); beyond it, the Atlas floor takes over (so the
 * procedural mesh always spawns on arrival).
 */
export const computeAtlasFlightTarget = (
  starDistanceFromSunPc: number
): AtlasFlightTarget => {
  const gaiaAngularRadiusRad = computeGaiaTargetAngularRadiusRad(
    starDistanceFromSunPc
  );
  const clampedByAtlasFloor =
    gaiaAngularRadiusRad < ATLAS_MIN_ANGULAR_RADIUS_RAD;
  const angularRadiusRad = clampedByAtlasFloor
    ? ATLAS_MIN_ANGULAR_RADIUS_RAD
    : gaiaAngularRadiusRad;
  return {
    angularRadiusRad,
    clampedByAtlasFloor,
  };
};

/**
 * Camera-to-star distance (atlas world units) such that a sphere
 * of `radiusWorldUnits` subtends the given ANGULAR RADIUS at the
 * camera. From the geometric definition of angular radius:
 *   tan(angularRadius) = radius / distance  →  distance = radius / tan(angularRadius)
 * Matches Gaia's effective distance formula at
 * `InteractiveCameraModule.java:172` (target compared to
 * `radius / distance / fovFactor`) — see lib header for the
 * fovFactor divergence note.
 *
 * Returns `Infinity` for degenerate inputs (zero radius or zero
 * angle); callers should clamp via the body-clearance floor
 * (`radius * 1.1`).
 */
export const computeFlightTargetDistance = (
  radiusWorldUnits: number,
  angularRadiusRad: number
): number => {
  if (
    !Number.isFinite(radiusWorldUnits) ||
    !Number.isFinite(angularRadiusRad) ||
    radiusWorldUnits <= 0 ||
    angularRadiusRad <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return radiusWorldUnits / Math.tan(angularRadiusRad);
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
 *   - `computeFlightTargetDistance(radius, target.angularRadiusRad)`
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
    target.angularRadiusRad
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
  NEAR_TARGET_RADIUS_DEG,
  FAR_TARGET_RADIUS_DEG,
  NEAR_TARGET_RADIUS_RAD,
  FAR_TARGET_RADIUS_RAD,
  ATLAS_MIN_ANGULAR_RADIUS_RAD,
} as const;
