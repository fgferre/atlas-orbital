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
 * **fovFactor divergence** (Codex round-4 P2, 2026-05-05 — corrects
 * the round-3 header which had the wrong reference numbers). Gaia
 * normalises `getSolidAngle()` by `camera.getFovFactor()`, defined
 * in `AbstractCamera.java:42, 148` (clone at `/tmp/gaiasky/`,
 * verified) as
 *   fovFactor = tan(camera.fieldOfView * 0.5) / TAN_REF_FOV
 * with `TAN_REF_FOV = tan(40°/2) = tan(20°)` — i.e. the reference
 * fov is 40°, NOT 60° as the round-3 header incorrectly stated.
 * Gaia's config default is `fov: 45.0` (`assets/conf/config.yaml:125`),
 * giving `fovFactor = tan(22.5°) / tan(20°) ≈ 1.138`. Atlas's default
 * fov is also 45° (search `fov: 45` in this repo), so at the
 * SHARED default fov, the Atlas landing distance (without the
 * fovFactor multiplier) is silently inflated by ~14% relative to
 * a pixel-equivalent Gaia port. Decision: accept the divergence as
 * landing-only scope for the "Gaia-informed" label — adopting
 * fovFactor would also require rebaking every named-star pin and
 * makes the lib's behavior fov-coupled (e.g. `fovFactor ≈ 1.586` at
 * 60°, `≈ 0.736` at 30°), which surprises callers that don't read
 * the camera fov before landing. If Atlas exposes a runtime fov
 * slider, revisit so the divergence doesn't grow non-linearly.
 *
 * The L40 lesson (`tasks/lessons.md`) — "verified against source
 * needs name + semantics check" — applies recursively here: the
 * round-3 header pinned a divergence note without checking the
 * actual Gaia constants against source. Round-4 reads
 * `AbstractCamera.java:42` directly to fix the pin.
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
 * absolute floor, 5× radius, gate-driven).
 *
 * Two motivations, in order:
 *
 *   1. **Cinematic landing** (the dominant motivation): without
 *      this floor, ultra-compact stars (white dwarfs at ~0.0465 wu
 *      radius, neutron-star-class hypotheticals) would land at
 *      single-digit world units — the angle-driven term gives e.g.
 *      ~0.05 wu for a white dwarf, which puts the camera ~1 radius
 *      from the surface. The star fills more than half the sky
 *      and the next user input feels like a teleport. 10 wu keeps
 *      the disc visible (~0.27° apparent angular radius for a
 *      white dwarf) while staying clear of "I'm inside the star"
 *      framing.
 *
 *   2. **Landing-time near-plane precision** (secondary, NOT a
 *      runtime invariant): at 10 wu landing, `camera.near = 0.05 *
 *      0.01 = 5e-4 wu` is comfortable for the perspective
 *      transform's depth buffer. **Important: this protection is
 *      LANDING-ONLY.** `OrbitControls.minDistance = targetRadius
 *      * 1.1` (set in the camera-state useEffect) does NOT enforce
 *      the 10 wu floor — once the user dolly's in, the controls
 *      let the camera approach `radius * 1.1` (e.g. ~0.05 wu for
 *      a white dwarf). If runtime near-plane precision matters
 *      more than user dolly freedom, change the minDistance
 *      assignment to `Math.max(targetRadius * 1.1,
 *      ATLAS_MIN_LANDING_DISTANCE_WU)`. Codex round-3 first
 *      restored the constant; round-4 (2026-05-05) clarified the
 *      landing-only scope after the round-3 comment overstated
 *      runtime protection.
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
