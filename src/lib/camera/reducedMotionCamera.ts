import * as THREE from "three";

/**
 * Reduced-motion camera policy (a11y finding N-4, 2026-07-23).
 *
 * **The gap.** Every camera animation path in `lib/camera` was
 * motion-preference-blind: `CameraTransition` (curated-body fly-to),
 * `HygPhysicsFlight` + `AimLerp` (catalog-star fly-to) and the
 * 12 s `InitialCameraAnimation` intro all ran at full amplitude with
 * `prefers-reduced-motion: reduce` set, `matchMedia().matches === true`
 * and `accessibility.reducedMotion === true` in the store. Measured
 * damage: planet overlays (a direct projection of the camera) swept
 * 150-350 px over ~3 s per focus click, and the intro swept for 12 s.
 *
 * **The policy — snap, don't shorten.** WCAG 2.3.3 (Animation from
 * Interactions) asks that motion animation triggered by interaction
 * can be disabled "unless the animation is essential". A camera
 * fly-to is not essential: the essential outcome is the *end pose*
 * (the focused body framed on screen). So under reduced motion we
 * deliver the end pose directly instead of picking some shorter
 * duration — a "very short" sweep is still large-amplitude
 * vestibular motion, just compressed, and there is no duration at
 * which a 1e9-world-unit traversal stops being motion.
 *
 * Both helpers here are pure so the policy is unit-testable without
 * a renderer — same shape as `components/canvas/gridFade.ts`, which
 * snaps the grid fade under the same preference.
 *
 * **Single source of truth.** Call sites read the preference from
 * `store.accessibility.reducedMotion` (synced with the media query
 * in `App.tsx`); this module never touches `matchMedia` itself.
 */

/**
 * Duration for a duration-driven camera transition
 * (`CameraTransition`, `AimLerp`).
 *
 * Returns `0` under reduced motion, which both consumers already
 * treat as "resolve to the endpoint on the first update" — so the
 * transition still runs through its normal completion path
 * (`onComplete`, `isActive` bookkeeping) rather than needing a
 * parallel snap branch at the call site.
 *
 * Non-finite or negative base durations clamp to `0` too, so a bad
 * upstream computation degrades to a snap instead of `NaN` progress.
 */
export const resolveCameraTransitionDurationMs = (
  baseDurationMs: number,
  reducedMotion: boolean
): number => {
  if (reducedMotion) return 0;
  if (!Number.isFinite(baseDurationMs) || baseDurationMs < 0) return 0;
  return baseDurationMs;
};

/**
 * End pose for a gate-driven catalog-star fly-to (`HygPhysicsFlight`
 * has no duration to zero out — completion is an angular-radius
 * gate — so reduced motion needs the landing position computed
 * directly).
 *
 * Places the camera `landingDistanceWu` from `targetPos`, along the
 * direction it is already viewing from. Keeping the current bearing
 * means the snap changes distance only, never the approach angle:
 * the smallest possible visual delta that still frames the star at
 * the M2.5 landing distance.
 *
 * Edge cases:
 *   - camera coincident with the star (degenerate direction) → falls
 *     back to +Z so the result is never `NaN`;
 *   - non-finite `landingDistanceWu` → returns the current position
 *     unchanged (no pose better than the one we have).
 */
export const resolveSnapLandingPosition = (
  currentCameraPos: THREE.Vector3,
  targetPos: THREE.Vector3,
  landingDistanceWu: number
): THREE.Vector3 => {
  if (!Number.isFinite(landingDistanceWu)) {
    return currentCameraPos.clone();
  }

  const direction = new THREE.Vector3().subVectors(currentCameraPos, targetPos);
  if (direction.lengthSq() <= 1e-12) {
    direction.set(0, 0, 1);
  } else {
    direction.normalize();
  }

  return direction
    .multiplyScalar(Math.max(landingDistanceWu, 0))
    .add(targetPos);
};
