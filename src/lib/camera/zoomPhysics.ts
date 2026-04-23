/**
 * T4.2-γ — inertial zoom physics.
 *
 * Pure-TS port of the velocity / friction / acceleration loop that
 * Gaia Sky's `NaturalCamera` runs each frame. The relevant code in
 * `/tmp/gaiasky/core/src/gaiasky/scene/camera/NaturalCamera.java`:
 *
 *   - `addForwardForce(amount)` (lines 705-728) — pushes a scaled
 *     direction vector into the `force` accumulator; called every
 *     time the user gives forward input (wheel scroll, key press).
 *   - The per-frame integrator (lines 988-1010, inside the
 *     `updatePosition` flow) — sums `force` into `vel`, applies a
 *     friction term `friction = -velocity × counterAmount × dt`
 *     (the same `counterAmount` curve T4.2-α already mirrors
 *     spatially), then nudges `pos` by `vel × dt`. Velocity
 *     persists across frames, producing the characteristic Gaia
 *     "give it a flick and watch it coast" zoom feel.
 *
 * **Atlas pre-T4.2-γ** uses the snappy step accumulator in
 * `lib/camera/controls.ts:accumulateWheelZoomSteps` + a wheel
 * event handler in `Scene.tsx:NormalizedWheelZoom`. Each wheel
 * event integrates `deltaY` into a fractional step buffer, flushes
 * full integer steps directly to `OrbitControls.dollyIn/dollyOut`,
 * and discards anything between events. That's snappy + immediate
 * but loses Gaia's coast-down feel and doesn't compose multiple
 * events into a smooth velocity ramp.
 *
 * **This module** provides the velocity-integrating primitives that
 * the new wheel handler can call:
 *
 *   1. `addZoomImpulse(velocity, deltaSteps)` — wheel event arrives
 *      → push fractional or integer steps onto the velocity (mirrors
 *      Gaia's `addForwardForce`).
 *   2. `applyZoomFriction(velocity, dt)` — per-frame exponential
 *      decay (`v ← v × exp(-friction × dt)`). Approximation of
 *      Gaia's `vel -= velocity × counterAmount × dt`; in steady-
 *      state with constant friction the math collapses to the same
 *      decay curve.
 *   3. `consumeZoomVelocity(velocity, dt)` — returns the fractional
 *      number of "logical zoom steps" to apply this frame
 *      (`velocity × dt`) plus the post-deadzone velocity. Caller
 *      converts the step count to an OrbitControls dolly multiplier
 *      via `Math.pow(zoomScalePerStep, |frameSteps|)`.
 *
 * **Documented divergences vs Gaia 1:1** (acknowledged in code):
 *
 *   - 1D scalar (zoom only) vs Gaia's 3D `force` / `vel` vectors.
 *     Atlas's wheel input is purely a forward/back zoom signal; the
 *     drag-rotate + pan paths stay on `OrbitControls`'s native
 *     spherical-delta damping (already proximity-aware via T4.2-α).
 *   - Friction is a single global rate constant
 *     (`ZOOM_FRICTION_PER_SECOND`) instead of T4.2-α's
 *     proximity-aware `counterAmount` curve. The proximity-aware
 *     coupling between zoom velocity and focus distance is a future
 *     T4.2-γ-tighten pass; the current wave's deliverable is the
 *     coast-down feel, not the proximity-modulated friction profile.
 *   - Deadzone (`ZOOM_VELOCITY_DEADZONE`) replaces Gaia's `fullStop`
 *     flag — atlas snaps velocity to 0 below threshold rather than
 *     tracking a separate "user is no longer touching the input"
 *     state. Same UX outcome (velocity reaches 0 at rest).
 *   - Force-accumulator step collapsed. Gaia integrates `force`
 *     into `vel` over `dt` each frame
 *     (`NaturalCamera.java:988-995`); atlas's wheel handler bumps
 *     velocity directly because each wheel event is a discrete
 *     impulse, not a sustained force, so the dt-multiplied
 *     integration step adds nothing. Equivalent to Gaia's behavior
 *     for impulsive inputs.
 *   - Per-body speed scaling (`NaturalCamera.java:710 speedScaling()`)
 *     is NOT inside this module. Atlas preserves the proximity-aware
 *     scale factor through the existing
 *     `DynamicZoom` + `OrbitControls.getZoomScale()` chain in
 *     `Scene.tsx`: `calculateAdaptiveZoomSpeed(distance, minDistance)`
 *     drives `controls.zoomSpeed` per frame, and `getZoomScale()`
 *     consumes that to compute the per-step scale factor that the
 *     wheel handler raises to `frameSteps`. The two modules
 *     compose: zoomPhysics owns the velocity decay; DynamicZoom
 *     owns the per-step magnitude.
 *   - **Sign convention is inverted from Gaia.** Gaia's
 *     `addForwardForce(amount)` treats positive `amount` as
 *     "forward" / approach
 *     (`NaturalCamera.java:707-708 — "positive forward, negative
 *     backward"`); atlas's wheel-input chain
 *     (`accumulateWheelZoomSteps` → `addZoomImpulse` → wheel
 *     handler dispatch) treats positive `stepCount` /
 *     `frameSteps` as zoom OUT (camera retreats), because that
 *     matches DOM `WheelEvent.deltaY > 0` semantics
 *     (scroll-down / wheel-back). The full atlas chain is
 *     self-consistent (positive everywhere = zoom out → dollyOut);
 *     porting the formula required no sign flip because the
 *     chain works in atlas's domain end-to-end. A future port
 *     of Gaia's `addForwardForce` semantics directly (e.g., for
 *     keyboard-driven dolly) would need to flip the sign.
 */

/**
 * Per-step velocity injection. Each integer wheel step (one detent)
 * pushes this many "logical zoom steps per second" onto the
 * velocity. With friction ≈ 8 /s, a single click coasts for
 * ~250 ms before crossing the deadzone — feels like a flick,
 * not a snap.
 */
export const ZOOM_IMPULSE_PER_STEP = 4.0;

/**
 * Exponential decay rate (per second) applied to velocity each
 * frame. Higher = stops sooner. 8 /s halves velocity every
 * ~87 ms (`ln(2) / 8`) — fast enough that wheel flicks settle
 * within a third of a second, slow enough to feel inertial.
 */
export const ZOOM_FRICTION_PER_SECOND = 8.0;

/**
 * Below this absolute velocity (in logical steps/sec), snap to
 * zero. Prevents float drift that would keep the camera
 * imperceptibly creeping after the visual motion has stopped.
 * Tuned to ≈ 1 logical step every 10 s, well below human
 * perception threshold.
 */
export const ZOOM_VELOCITY_DEADZONE = 0.1;

/**
 * Apply an impulse from a wheel event. Returns the new velocity
 * (caller stores in a ref). Pure function so the unit tests pin
 * exact arithmetic.
 *
 * `deltaSteps` is the (possibly fractional) wheel-step contribution
 * for this event, using the same sign convention as
 * `accumulateWheelZoomSteps` in `lib/camera/controls.ts`:
 *   - Positive = zoom out (camera retreats; positive `deltaY`)
 *   - Negative = zoom in  (camera approaches; negative `deltaY`)
 *
 * The downstream wheel handler dispatches the resulting velocity
 * to `OrbitControls.dollyOut` for positive `frameSteps` and
 * `OrbitControls.dollyIn` for negative — matching the pre-T4.2-γ
 * mapping in `Scene.tsx:NormalizedWheelZoom`.
 *
 * Mirrors Gaia's `addForwardForce(amount)` — accumulates impulses
 * into a velocity buffer that the per-frame integrator then
 * spends.
 */
export const addZoomImpulse = (velocity: number, deltaSteps: number): number =>
  velocity + deltaSteps * ZOOM_IMPULSE_PER_STEP;

/**
 * Per-frame exponential friction. Equivalent to Gaia's
 * `vel.scl(1 - friction * dt)` for the small-dt regime;
 * `Math.exp(-friction × dt)` is the closed-form solution to the
 * differential equation `dv/dt = -friction × v` and avoids the
 * negative-velocity blow-up that the linear approximation can
 * produce when `friction × dt > 1` (a 60 Hz frame at the
 * default friction is `8/60 = 0.133` so the linear form would
 * be safe, but the exact form is robust to dropped frames).
 */
export const applyZoomFriction = (velocity: number, dt: number): number =>
  velocity * Math.exp(-ZOOM_FRICTION_PER_SECOND * dt);

/**
 * One full per-frame tick: apply friction, snap below deadzone,
 * compute the fractional zoom steps to dispatch this frame.
 *
 * Returns:
 *   - `nextVelocity`: post-friction velocity (caller stores in ref).
 *   - `frameSteps`: signed fractional logical zoom steps to apply
 *     in this frame (caller converts to an OrbitControls dolly
 *     multiplier via `Math.pow(zoomScalePerStep, |frameSteps|)`).
 *
 * Application order matters: friction first (so the velocity that
 * drives this frame's motion is already partially decayed),
 * deadzone-snap before producing `frameSteps` (so we don't
 * dispatch dolly calls below threshold).
 */
export const consumeZoomVelocity = (
  velocity: number,
  dt: number
): { nextVelocity: number; frameSteps: number } => {
  const dampedVelocity = applyZoomFriction(velocity, dt);
  if (Math.abs(dampedVelocity) < ZOOM_VELOCITY_DEADZONE) {
    return { nextVelocity: 0, frameSteps: 0 };
  }
  return {
    nextVelocity: dampedVelocity,
    frameSteps: dampedVelocity * dt,
  };
};
