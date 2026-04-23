/**
 * T4.2-α — proximity-aware damping curve.
 *
 * Pure-TS mirror of Gaia Sky's `counterAmount` block in
 * `NaturalCamera.java:993-997` (MPL-2.0). Gaia's friction model
 * scales the per-frame counter-velocity by `counterAmount`; when the
 * camera is in FOCUS_MODE and zooming TOWARD the focus, that base
 * value is multiplied by `1 / ((distToCamera - elevation) / elevation)`
 * — i.e. friction grows unboundedly as the camera approaches the
 * body's surface, producing the characteristic "kiss the surface,
 * stop instantly" feel without a hard collision shell.
 *
 * **Source quote** (`/tmp/gaiasky/core/src/gaiasky/scene/camera/NaturalCamera.java:993-997`):
 * ```
 * if (fullStop && focus.isValid()) {
 *     double elevation = focus.getElevationAt(pos);
 *     double counterAmount = lastFwdAmount < 0 && cinematic
 *         ? FastMath.min(speedScaling, 200) : 2;
 *     if (getMode().isFocus() && lastFwdAmount > 0) {
 *         counterAmount *= 1.0 / ((focus.getDistToCamera() - elevation) / elevation);
 *     }
 *     ...
 * }
 * ```
 *
 * **Atlas adaptation.** Atlas's camera input goes through three-stdlib
 * `OrbitControls`, which dampens spherical/pan deltas each frame by
 * a single scalar `dampingFactor ∈ (0, 1]`. Lower = smoother
 * coast; higher = stronger friction. Three-stdlib's `update()` reads
 * `scope.dampingFactor` per frame
 * (`OrbitControls.js:191-235`), so a per-frame setter is supported
 * without re-init.
 *
 * The mapping below preserves Gaia's intent (friction rises as the
 * camera nears the body surface) while bounding the result to the
 * `[base, max]` interval `OrbitControls` expects:
 *
 *   1. Compute `proximityRatio = elevation / (cameraDistance - elevation)`
 *      — direct port of Gaia's `1 / ((distToCamera - elevation) / elevation)`.
 *   2. Saturate via `closeness = proximityRatio / (1 + proximityRatio)`
 *      — `[0, ∞) → [0, 1)`, smooth + monotonic, no division-by-zero
 *      gotcha at the surface boundary.
 *   3. Linear-interpolate damping between `PROXIMITY_DAMPING_BASE`
 *      (current OrbitControls default 0.05 — smooth coasting at
 *      stellar distances) and `PROXIMITY_DAMPING_MAX` (0.5 — hard
 *      stop at surface contact).
 *
 * Documented divergences vs Gaia 1:1:
 *   - `lastFwdAmount` direction gating NOT ported. Gaia only
 *     applies the proximity scale when the camera is moving TOWARD
 *     the focus (`lastFwdAmount > 0`); atlas applies it both
 *     directions because OrbitControls doesn't expose a directional
 *     velocity vector and the symmetric behavior is closer to user
 *     expectation in a viewer (you don't want the camera coasting
 *     freely AWAY from a focused body either).
 *   - `cinematic` toggle deferred (open decision in ROADMAP §T4.2).
 *     Atlas always uses the non-cinematic base.
 *   - Saturation curve replaces Gaia's unbounded `counterAmount`
 *     because OrbitControls' `dampingFactor` lives in `(0, 1]`.
 *     Same monotonicity (closer = stronger) preserved.
 *   - `fullStop` precondition NOT ported. Gaia gates the
 *     proximity-aware friction on `fullStop` (≈0.5 s after user
 *     input ends) and uses a separate force-derived friction
 *     during active input
 *     (`NaturalCamera.java:1007-1010`). Atlas writes the damping
 *     factor every frame because OrbitControls has a single
 *     damping mode whose effect is naturally swamped by active
 *     user-input deltas (sphericalDelta accumulates faster than
 *     `1 − dampingFactor` can dissipate). The result is the same
 *     "proximity-aware coast-down" UX without needing a
 *     fullStop-equivalent gate; the architectural difference is
 *     that Gaia has two friction modes whereas atlas has one.
 *
 * The curve is pure-TS so it can be exercised by unit tests without
 * mounting a Three.js scene — tests pin sample
 * `(cameraDistance, elevation) → dampingFactor` triples to catch
 * regressions in either the formula port or the saturation mapping.
 */

/** Default OrbitControls damping (atlas pre-T4.2-α). Smooth coasting at stellar distances. */
export const PROXIMITY_DAMPING_BASE = 0.05;

/** Damping ceiling at body-surface contact. Empirical; user can tune via T4.2-β follow-up. */
export const PROXIMITY_DAMPING_MAX = 0.5;

/**
 * Compute the per-frame `dampingFactor` value for OrbitControls
 * given the camera's distance to the focused body and the body's
 * surface elevation (radius for spherical bodies). Returns
 * `PROXIMITY_DAMPING_BASE` when no focus is active OR the focus
 * has zero/negative elevation (defensive — atlas catalog data
 * shouldn't produce these but handle gracefully).
 *
 * Behavior at boundaries:
 *   - `cameraDistance <= elevation` (camera at-or-below surface):
 *     return `PROXIMITY_DAMPING_MAX` (saturated).
 *   - `cameraDistance >> elevation` (far): asymptotically returns
 *     `PROXIMITY_DAMPING_BASE`.
 *   - `cameraDistance == 2 × elevation` (one body-radius above
 *     surface): saturation gives `closeness = 0.5`, so damping
 *     sits halfway between base and max.
 */
export const computeProximityDamping = (
  cameraDistance: number,
  elevation: number
): number => {
  if (elevation <= 0) return PROXIMITY_DAMPING_BASE;
  if (cameraDistance <= elevation) return PROXIMITY_DAMPING_MAX;

  const aboveSurface = cameraDistance - elevation;
  const proximityRatio = elevation / aboveSurface;
  const closeness = proximityRatio / (1 + proximityRatio);
  return (
    PROXIMITY_DAMPING_BASE +
    (PROXIMITY_DAMPING_MAX - PROXIMITY_DAMPING_BASE) * closeness
  );
};
