/**
 * T4.2-β-handler — approximation of Gaia's `updateRotationFree` for
 * atlas's OrbitControls.
 *
 * When `surfaceModeActive` is true (the T4.2-β predicate fires),
 * Gaia swaps the camera rotation handler from `directionToTarget`
 * (camera always points at focus) to `updateRotationFree` (camera
 * yaws + pitches around its OWN axes — free look). See
 * `/tmp/gaiasky/core/src/gaiasky/scene/camera/NaturalCamera.java:
 *   - 529-535 — the handler swap conditional
 *   - 1111-1127 — `updateRotationFree` body: `rotate(aux1, pitch)` +
 *     `rotate(up, yaw)` apply yaw/pitch around the camera's right
 *     and up vectors respectively.`
 *
 * **Atlas architecture.** Atlas uses three-stdlib `OrbitControls`,
 * which fundamentally orbits the camera around `controls.target`.
 * Drag-rotate moves the camera along a sphere centered at target.
 * There is no built-in "free look around camera's own axes" mode.
 *
 * **The approximation.** If we move `controls.target` to a point
 * just in front of the camera (`camera.position + forward × OFFSET`),
 * the orbit sphere becomes tiny and centered near the camera — drag-
 * rotate effectively yaws/pitches the camera about itself. This is
 * NOT identical to Gaia's pure free look (OrbitControls still
 * computes spherical coordinates around the near-target, so the
 * camera position does shift slightly on drag), but the feel is
 * directionally correct for a first ship: user can look around from
 * a surface vantage without the camera snapping back to the body
 * center.
 *
 * **Documented divergences vs Gaia 1:1**:
 *
 *   - Pivot-around-self vs orbit-around-near-target. Gaia's camera
 *     position stays fixed during `updateRotationFree`; atlas's
 *     camera wobbles by `OFFSET` on each drag-rotate because
 *     OrbitControls is not a free-look control. Acceptable
 *     first-cut approximation; a second ship could swap to
 *     `FlyControls` for perfect parity (architectural cost: dual
 *     control-class management + state sync across the swap).
 *   - Pitch/yaw limits. OrbitControls has `minPolarAngle` /
 *     `maxPolarAngle` clamps that prevent looking straight up/down.
 *     Gaia's free-look does not. Atlas inherits the clamp; user
 *     can still look around ~170° of the sky, which matches
 *     typical first-person interaction conventions and avoids the
 *     gimbal-lock pitfall at the poles.
 *   - No roll. Gaia's full input layer includes a `updateRoll`
 *     path for cinematic mode; atlas has no roll input and
 *     OrbitControls doesn't support roll either. Out of scope.
 *
 * **Why the offset is 1 world unit.** The smallest non-zero value
 * that avoids OrbitControls' internal divide-by-zero guards while
 * keeping the orbit sphere effectively collapsed onto the camera.
 * Smaller values (0.01, 0.1) work in principle but Three.js's
 * Spherical coordinate math uses `radius > 0` assertions that can
 * produce NaN at sub-unit scales in float32 vertex math. 1.0 is
 * the conservative choice; visually indistinguishable from free
 * look at atlas's typical camera ranges (body radii are in the
 * thousands of world units, so 1 is effectively zero).
 */

import * as THREE from "three";

/**
 * Distance (world units) to place the free-look target in front of
 * the camera when surface mode is active. See module header for
 * the "why 1.0" rationale.
 */
export const SURFACE_LOOK_OFFSET_WORLD_UNITS = 1.0;

/**
 * Given the camera's world-space position + forward direction,
 * compute the `controls.target` value that makes OrbitControls'
 * orbit sphere effectively collapse onto the camera (→ free-look
 * approximation). Caller copies the result into `controls.target`.
 *
 * Pure geometry — no Three.js scene traversal, no side effects
 * beyond writing to the optional `out` vector. Unit tests pin the
 * offset constant + sample inputs/outputs so a future offset tune
 * doesn't silently change behavior.
 *
 * `cameraForward` MUST be a unit vector (caller's responsibility;
 * use `camera.getWorldDirection(target)` which normalizes).
 *
 * When `out` is provided, writes the result into it and returns it
 * (R3F idiom for reusing scratch vectors and avoiding per-frame
 * allocations). When omitted, allocates a fresh Vector3.
 */
export const computeSurfaceLookTarget = (
  cameraPosition: THREE.Vector3,
  cameraForward: THREE.Vector3,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 => {
  return out
    .copy(cameraForward)
    .multiplyScalar(SURFACE_LOOK_OFFSET_WORLD_UNITS)
    .add(cameraPosition);
};
