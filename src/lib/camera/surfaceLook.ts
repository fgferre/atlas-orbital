/**
 * T4.2-β-handler (Silver) — pure math for the pointer-lock first-
 * person look path.
 *
 * Ports the rotation semantics of Gaia Sky's `GameMouseKbdListener`
 * and `updateRotationFree` / `updateRoll` handlers (MPL-2.0) into
 * stateless TypeScript helpers. The React glue lives in
 * `useSurfaceModePointerLock.ts` (lifecycle) and
 * `SurfaceModeFirstPerson.tsx` (per-frame application).
 *
 * **Source citations** (`/tmp/gaiasky/core/src/gaiasky/`):
 *
 *   - `input/GameMouseKbdListener.java:152-169` — mouse-look
 *     pipeline. Sensitivity is `±1 / (dt * 2e2)` applied to raw
 *     pixel deltas, then `addYaw(dx) / addPitch(dy)`. The Y
 *     sensitivity is NEGATIVE (`-1f / dt`), which encodes "mouse
 *     moves down (+screenY) → dy < 0" — the effective sign of the
 *     pitch impulse at the downstream rotator.
 *   - `scene/camera/NaturalCamera.java:1111-1128` —
 *     `updateRotationFree`. Pitch axis = `direction × up` (camera
 *     right), yaw axis = `up` (camera up). Pitch angle is
 *     `+pitch.z × rotateSpeed`; yaw angle is `-yaw.z × rotateSpeed`.
 *   - `scene/camera/NaturalCamera.java:1130-1137` — `updateRoll`.
 *     Roll axis = `direction` (camera forward). Angle is
 *     `-roll.z × rotateSpeed`. Bound to Q/E via
 *     `GameMouseKbdListener.java:74-80`:
 *     `Q → addRoll(+keySens)`, `E → addRoll(-keySens)`.
 *
 * **Intent recovered from the sign chain.** Walking the Gaia sign
 * chain (mouse input → addYaw/addPitch → integration → rotate) is
 * fiddly because GDX's `rotate(axis, angle)` and Three.js's
 * `rotateY(angle)` use the same right-hand rule but opposite
 * handedness on some axes after the `direction × up` derivation.
 * Rather than chasing the sign through every stage, we pin the
 * USER-VISIBLE intent that Gaia's Game mode ships with — which is
 * the universal FPS convention:
 *
 *   1. Mouse right (`+movementX`) → camera looks right.
 *   2. Mouse down (`+movementY`) → camera looks down.
 *   3. `Q` held → camera rolls left (horizon tilts counter-
 *      clockwise from the user's viewpoint).
 *   4. `E` held → camera rolls right (horizon tilts clockwise).
 *
 * Three.js local-axis semantics (Y-up, -Z forward, +X right):
 *
 *   - `camera.rotateY(+a)` rotates around local Y by `+a` using the
 *     right-hand rule → camera's forward (-Z) rotates toward +X
 *     (its own right side moving behind it, head turns LEFT).
 *     Therefore "look right" maps to `rotateY(-a)`, i.e. the yaw
 *     angle we emit is `yaw = -movementX × sensitivity`.
 *   - `camera.rotateX(+a)` rotates around local X by `+a` using the
 *     right-hand rule → camera's up (+Y) rotates toward camera's
 *     back (+Z), which pulls forward (-Z) toward +Y (UP). Therefore
 *     "look up" maps to `rotateX(+a)`, and "look down" to `-a`:
 *     pitch = `-movementY × sensitivity` (mouse down → negative
 *     pitch → `rotateX(negative)` → look down).
 *   - `camera.rotateZ(+a)` rotates around local Z (+Z is out of the
 *     screen toward the viewer) by `+a` → camera's right (+X)
 *     rotates toward its up (+Y). That tilts the right side UP
 *     relative to the user's eyes, which the viewer perceives as
 *     the horizon rolling counter-clockwise. Therefore "roll left"
 *     (Q) maps to `rotateZ(+a)`, and "roll right" (E) to `-a`.
 *
 * **Atlas sensitivity vs Gaia.** Gaia's `1/(dt * 2e2)` produces a
 * frame-rate-independent low-pass amplitude — at 60 FPS with dt ≈
 * 0.0167 s, the pre-low-pass coefficient is `1/(0.0167 × 200)` ≈
 * 0.3 per pixel per frame. That's an intermediate acceleration
 * feeding a damped integrator; there isn't a clean "radians per
 * pixel" conversion because Gaia's rotation handler then multiplies
 * by `rotateSpeed × movementMultiplier × fovFactor` before calling
 * `rotate`. For atlas we collapse this to a single radians-per-pixel
 * constant tuned to AAA FPS defaults (~0.002 rad/px = ~0.11°/px
 * matches Valve/Id default mouse sensitivities in Source / idTech).
 * Runtime smoke is the tuning authority — if the feel is off, this
 * constant is the knob.
 *
 * **Pitch clamp.** We clamp accumulated pitch to ±(π/2 − ε) so the
 * camera never points exactly along the world up axis, which would
 * cause the yaw rotation (around camera-local Y) to become
 * co-linear with pitch → gimbal lock and a visible "flip". Gaia's
 * incremental handler has the same risk but relies on user input
 * to unwind before reaching the pole; atlas clamps defensively.
 * The consumer accumulates a `pitchAccumulator` ref and passes it
 * through `clampPitch` before every `rotateX` application so the
 * effective delta is always `clamped(accum + delta) − accum`.
 */

/**
 * Radians of rotation per pixel of raw `MouseEvent.movementX` /
 * `.movementY` in pointer-locked state. Tuned to feel AAA-FPS at
 * default mouse DPI (~800-1600 DPI range). Consumer can override
 * via the `sensitivityRadPerPx` parameter on `computeMouseLookDelta`.
 *
 * Math intuition: 0.002 rad/px → ~0.115°/px → ~100° of rotation per
 * ~900 px of mouse travel, which is a comfortable neck-swivel at
 * typical desk distances.
 */
export const SURFACE_LOOK_MOUSE_SENSITIVITY_RAD_PER_PX = 0.002;

/**
 * Radians per second of roll rotation while `Q` or `E` is held.
 * π/2 rad/s = 90°/s — a full quarter turn per second, which matches
 * Gaia's default `keySensitivity` feel after its `rotateSpeed`
 * multiplier. Roll is an opt-in cinematic so the rate is chosen for
 * deliberate use, not accidental nudging.
 */
export const SURFACE_LOOK_ROLL_RAD_PER_SEC = Math.PI / 2;

/**
 * Upper bound on accumulated pitch (absolute value). Slightly below
 * π/2 to stay clear of the pole where yaw becomes co-linear with
 * pitch (gimbal lock). 0.01 rad ≈ 0.57° of headroom is enough to
 * prevent the singularity while remaining imperceptible to the
 * user.
 */
export const SURFACE_LOOK_MAX_PITCH_RAD = Math.PI / 2 - 0.01;

/**
 * Radian angles to apply around the camera's local axes for a
 * single mouse-move event.
 *
 *   - `yaw` → pass to `camera.rotateY(yaw)`.
 *   - `pitch` → pass to `camera.rotateX(pitch)` (AFTER clamping the
 *     running accumulator via `clampPitch`).
 */
export interface MouseLookDelta {
  yaw: number;
  pitch: number;
}

/**
 * Convert a raw `MouseEvent.movementX/Y` pair (pixels) into
 * Three.js local-axis rotation angles that produce the FPS-standard
 * look direction:
 *
 *   - `+movementX` (mouse right) → negative yaw → `rotateY(yaw)`
 *     rotates the camera's forward toward +X → camera looks right.
 *   - `+movementY` (mouse down) → negative pitch → `rotateX(pitch)`
 *     rotates the camera's forward toward -Y → camera looks down.
 *
 * Pure: no DOM access, no Three.js calls, no refs. Signed numerics
 * only. Consumer owns the camera mutation.
 */
export const computeMouseLookDelta = (
  movementX: number,
  movementY: number,
  sensitivityRadPerPx: number = SURFACE_LOOK_MOUSE_SENSITIVITY_RAD_PER_PX
): MouseLookDelta => ({
  yaw: -movementX * sensitivityRadPerPx,
  pitch: -movementY * sensitivityRadPerPx,
});

/**
 * Clamp a running pitch accumulator to ±`SURFACE_LOOK_MAX_PITCH_RAD`.
 * Call pattern (per frame):
 *
 * ```ts
 * const proposed = pitchAccumRef.current + pitchDelta;
 * const clamped = clampPitch(proposed);
 * const effectiveDelta = clamped - pitchAccumRef.current;
 * pitchAccumRef.current = clamped;
 * camera.rotateX(effectiveDelta);
 * ```
 *
 * This pattern guarantees `rotateX` receives exactly the angle
 * needed to reach the clamped target, so accumulated mouse impulses
 * beyond the pole are silently discarded instead of wrapping.
 */
export const clampPitch = (
  pitchRad: number,
  maxAbs: number = SURFACE_LOOK_MAX_PITCH_RAD
): number => {
  if (pitchRad > maxAbs) return maxAbs;
  if (pitchRad < -maxAbs) return -maxAbs;
  return pitchRad;
};

/**
 * Roll angle (radians) for a single frame given the current Q/E key
 * state and elapsed time.
 *
 *   - Q held, E not held → `+rollRadPerSec × dt` (roll left, CCW).
 *   - E held, Q not held → `-rollRadPerSec × dt` (roll right, CW).
 *   - Both held OR neither held → 0 (symmetric cancel).
 *   - Negative `dt` is clamped to 0 (defensive; R3F's useFrame
 *     shouldn't produce negative dt, but a paused clock + resume
 *     sequence in a test harness could).
 */
export const computeRollDelta = (
  qPressed: boolean,
  ePressed: boolean,
  dtSeconds: number,
  rollRadPerSec: number = SURFACE_LOOK_ROLL_RAD_PER_SEC
): number => {
  if (qPressed === ePressed) return 0;
  const dt = Math.max(0, dtSeconds);
  return (qPressed ? 1 : -1) * rollRadPerSec * dt;
};
