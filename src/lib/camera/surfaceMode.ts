/**
 * T4.2-β — surface-mode activation predicate.
 *
 * Pure-TS port of Gaia Sky's `surfaceModeFlag` block in
 * `NaturalCamera.java:524-548` (MPL-2.0). Gaia flips a camera into
 * "surface mode" when the user gets close enough to a planet that
 * looking around feels more natural than orbiting; in that mode the
 * rotation handler swaps from `directionToTarget` (camera always
 * tracks the focus) to `updateRotationFree` (free look around the
 * camera's own axes), so the user can rotate their view without
 * losing the surface vantage.
 *
 * **Source quote** (`/tmp/gaiasky/core/src/gaiasky/scene/camera/NaturalCamera.java:524-527`):
 * ```
 * // Surface mode activates when we're at 1.8 radii from the focus object,
 * // and it is a planet. Camera can't be tracking an object.
 * surfaceModeFlag.set(
 *     !gamepadInput && !vr && !isTracking() && focus.isPlanet()
 *     && distFromFocus < focus.getRadius() * 2.5 / fovFactor);
 * ```
 *
 * NOTE the comment says "1.8 radii" but the actual literal is `2.5`
 * (lesson L27 — when plan vs source disagree, trust the source).
 * The effective threshold also depends on `fovFactor`, which Gaia
 * defines at `AbstractCamera.java:148` as
 * `tan(fov/2) / tan(REF_FOV/2)` with `REF_FOV = 40°`
 * (`AbstractCamera.java:42`). This is NOT a linear `fov/60` ratio
 * — the `tan` curve is critical for keeping the surface threshold
 * visually constant across FOV settings.
 *
 * **Atlas adaptation.** Atlas's input layer is mouse-only
 * (`gamepadInput` and `vr` always false) and has no separate
 * "tracking" mode (`isTracking()` always false), so the predicate
 * collapses to the focus-type + distance check. The full Gaia
 * gating is preserved as named parameters so a future controller
 * port can re-introduce the suppressors without revisiting the
 * formula.
 *
 * **Architectural divergence (documented).** This module computes
 * the boolean signal; the rotation-handler swap from
 * `directionToTarget` → `updateRotationFree` is NOT yet wired in
 * atlas. atlas's three-stdlib `OrbitControls` keeps focus-tracking
 * rotation in both modes; the surface-mode flag is observable via
 * the store so a future T4.2-β-handler ship can swap to a true
 * free-look mode (likely by repointing `controls.target` at the
 * camera position + a small forward offset, or by swapping to
 * `FlyControls` while the flag is active). This first ship lands
 * the foundation + signal so UI and follow-on ports can read it.
 */

/**
 * Multiplier on the focus body's visual radius. Gaia literal at
 * `NaturalCamera.java:527`.
 */
export const SURFACE_MODE_RADII_MULTIPLIER = 2.5;

/**
 * Reference FOV for `fovFactor` normalisation. Gaia constant at
 * `AbstractCamera.java:42` (`TAN_REF_FOV = tan(40 / 2)`).
 */
export const SURFACE_MODE_REFERENCE_FOV_DEG = 40;

/**
 * Compute Gaia's `fovFactor` (`AbstractCamera.java:148`) — the
 * ratio of `tan(fov/2)` to `tan(REF_FOV/2)`. Wider FOVs produce
 * larger fovFactor, which DIVIDES the surface-mode threshold so a
 * wider field of view lets the user get closer to the planet
 * before the surface mode trips. The `tan` curve (vs a linear
 * ratio) keeps the perceived viewport-to-body coverage roughly
 * constant.
 *
 * Returns 1 for `fov === REF_FOV` (40°). Atlas's default 45° FOV
 * yields ~1.138 (`tan(22.5°) / tan(20°)`).
 */
export const computeFovFactor = (fovDegrees: number): number => {
  const halfFovRad = (fovDegrees * Math.PI) / 360;
  const halfRefRad = (SURFACE_MODE_REFERENCE_FOV_DEG * Math.PI) / 360;
  return Math.tan(halfFovRad) / Math.tan(halfRefRad);
};

/**
 * Inputs Gaia uses to gate surface mode.
 *
 *   - `focusIsPlanet` mirrors `focus.isPlanet()`. Atlas resolves
 *     this from `body.type === "planet"`.
 *   - `distFromFocus` mirrors `camObj.lenDouble()`
 *     (`NaturalCamera.java:523`) — the camera-to-focus distance
 *     in render units.
 *   - `focusRadius` mirrors `focus.getRadius()`. Atlas uses
 *     `AstroPhysics.resolveSemanticBodyRadius`.
 *   - `fovDegrees` is the active perspective camera's vertical FOV.
 *   - `gamepadInput` / `vr` / `isTracking` are atlas-side
 *     suppressors kept as named flags so a future input-layer
 *     port can populate them; default false to mirror atlas's
 *     mouse-only state.
 */
export interface SurfaceModeInputs {
  focusIsPlanet: boolean;
  distFromFocus: number;
  focusRadius: number;
  fovDegrees: number;
  gamepadInput?: boolean;
  vr?: boolean;
  isTracking?: boolean;
}

/**
 * Direct port of `surfaceModeFlag.set(...)` at
 * `NaturalCamera.java:526-527`. Returns true when ALL of the
 * following hold:
 *   1. Not gamepad input.
 *   2. Not VR.
 *   3. Not tracking.
 *   4. Focus is a planet.
 *   5. `distFromFocus < focusRadius × SURFACE_MODE_RADII_MULTIPLIER / fovFactor`.
 *
 * Defensive against `focusRadius <= 0` (atlas catalog data should
 * never produce these; return false to be safe — the threshold
 * would be 0 and the inequality always false anyway, but the
 * explicit guard documents intent).
 */
export const isSurfaceModeActive = ({
  focusIsPlanet,
  distFromFocus,
  focusRadius,
  fovDegrees,
  gamepadInput = false,
  vr = false,
  isTracking = false,
}: SurfaceModeInputs): boolean => {
  if (gamepadInput || vr || isTracking) return false;
  if (!focusIsPlanet) return false;
  if (focusRadius <= 0) return false;

  const fovFactor = computeFovFactor(fovDegrees);
  const threshold = (focusRadius * SURFACE_MODE_RADII_MULTIPLIER) / fovFactor;
  return distFromFocus < threshold;
};
