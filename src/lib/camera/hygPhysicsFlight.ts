import * as THREE from "three";

/**
 * T6.4-M2.5 round-6 R6-A — gate-driven physics integrator for HYG
 * focus-click fly-to.
 *
 * **Architectural rationale** (per `tasks/waves/T6.4-visual-recovery.md
 * §Round-6`). M2.5 (S1-S7 + round-3..5b) ports Gaia Sky's
 * **scripted** `CameraModule.transition_position` flow: a linear
 * world-space lerp easeed by `logisticSigmoid`. Round-5's factor
 * 12→60 sweep correctly closed the divergence within that scripted
 * contract, but the contract itself is wrong for click-driven
 * focus: the user-perceived experience of solar→Sirius collapses
 * 99.5 % of trajectory progress into a ~825 ms warp window
 * (~6.4e8 wu/s ≈ 100× solar-system extent per frame at 60 fps).
 * No easing factor can fix that — the architecture has to change.
 *
 * Round-6 ports Gaia's **interactive** `InteractiveCameraModule.go_to_object`
 * shape (`/tmp/gaiasky/core/src/gaiasky/script/v2/impl/InteractiveCameraModule.java:174-200`)
 * combined with `NaturalCamera.java`'s force/friction physics
 * (`NaturalCamera.java:125,341,985-1011,1533-1537`):
 *   - per-frame velocity push toward target, ramping from rest;
 *   - friction proportional to current velocity (decel near gate);
 *   - completion is gate-driven on `currentAngularRadiusRad ≥
 *     targetAngularRadiusRad`, NOT on a fixed alpha=1.
 *
 * **Calibration vs blind port** (Codex 2026-05-06 R6 #2). Gaia's
 * `NaturalCamera` constants are tuned for libGDX desktop framerate,
 * parsec-internal coordinates (Atlas: 1 wu = 0.001 AU), and Gaia's
 * own Settings cinematic flags. We port the SHAPE (initial accel
 * → bounded terminal velocity → friction-decel near gate) and
 * calibrate the four constants empirically (R6-F sweep). Initial
 * values from the wave-file spec are starting points.
 *
 * **Semi-implicit Euler, not analytical kinematic** (Codex 2026-05-06
 * R6 #5). With variable acceleration (friction depends on current
 * velocity, which changes per frame), `pos += v·dt + 0.5·a·dt²`
 * is only exact for `a` constant over `dt`. Semi-implicit Euler
 * (`v += a·dt; pos += v·dt`) is symplectic, energy-stable in
 * oscillatory regimes, and the canonical integrator for game
 * physics with friction. Atlas adopts this.
 *
 * **`angularRadiusRad`, not `solidAngle`** (Codex 2026-05-06 R6 #4,
 * recurrence guard for L40). Gaia's `focusView.getSolidAngle()`
 * returns `(radius/distance)/fovFactor` — angular-radius semantics
 * despite the misnamed method. Round-6 keeps angular-radius
 * semantics consistent in the public API + internals; "solidAngle"
 * is reserved for citations of Gaia source.
 *
 * **Cancel = full stop, not drain** (Codex 2026-05-06 R6 #3). Gaia's
 * cancel works because the same physical camera reads user input,
 * so coasting on inertia coexists with user drag. Atlas's
 * `OrbitControls` is a separate input system; if the user drags
 * mid-flight, the autopilot can't keep coasting on inertia (would
 * fight the drag). `cancel()` here is `velocity = 0, force = 0`
 * synchronously, frozen position returned for the caller to sync
 * `OrbitControls.target` if needed (same handover pattern as M2.5
 * S5).
 */

/**
 * Initial force factor — wu/s² per wu of remaining distance. Gives
 * the camera a gentle ramp from rest. Combined with `MAX_VELOCITY_FACTOR`
 * this caps acceleration time naturally: at startup, velocity is
 * 0 so the cap doesn't bind; force pushes the camera toward target
 * until terminal velocity is reached.
 *
 * **Calibration first-guess (R6-F preliminary, 2026-05-06)**: 8.0.
 * With `FRICTION_RATE = 2.0` the equilibrium velocity is
 * `INITIAL_FORCE_FACTOR / FRICTION_RATE × distance = 4.0 × distance/s`,
 * which exceeds `MAX_VELOCITY_FACTOR × distance = 3.0 × distance/s`
 * — so the velocity cap binds (not the force/friction equilibrium),
 * and the effective decay rate is `MAX_VELOCITY_FACTOR = 3.0/s`.
 * Sirius arrival: `ln(D/G) / 3 ≈ 13.95 / 3 ≈ 4.65 s`, in the
 * wave-file Acceptance §1 4-6 s band. Subject to user-smoke
 * empirical refinement at R6-F close.
 */
const INITIAL_FORCE_FACTOR = 8.0;

/**
 * Max velocity factor — dimensionless, vmax = factor × distance/s.
 * Combined with `INITIAL_FORCE_FACTOR / FRICTION_RATE` (the
 * equilibrium velocity), the SMALLER of the two binds the per-frame
 * stride. With first-guess constants this is the binding constraint;
 * the system's effective decay rate (in the cap-bound regime) IS
 * this factor.
 *
 * **Calibration first-guess (R6-F preliminary, 2026-05-06)**: 3.0.
 * Picked so Sirius (D/G ≈ 1.15e6) arrives in `ln(D/G) / 3.0 ≈ 4.65 s`
 * — close to the wave-file Acceptance §1 4-6 s expectation for
 * Sirius. Note: with a single decay rate, far stars arrive
 * proportionally to `ln(distance)`, which means Betelgeuse
 * (D/G ≈ 173) lands in `ln(173)/3 ≈ 1.7 s` (faster than the
 * wave-file 7-10 s expectation). The acceptance §1 expected
 * arrival times scale non-linearly with distance, which a single
 * cap-rate cannot reproduce — R6-F empirical sweep should decide
 * whether to introduce a distance-dependent cap (e.g. velocity
 * proportional to `sqrt(distance)`) or accept the linear-log decay
 * shape as Gaia-faithful (Gaia's `speedScaling` is a piecewise
 * linear `flint` of focus distance — see
 * `NaturalCamera.java:1421-1438`, which produces approximately the
 * same shape).
 */
const MAX_VELOCITY_FACTOR = 3.0;

/**
 * Friction rate — 1/s exponential decay coefficient. Higher = faster
 * decel once force drops to zero. With `friction = -velocity ×
 * FRICTION_RATE`, velocity decays as `v(t) = v₀ × exp(-FRICTION_RATE × t)`
 * in the friction-only phase.
 *
 * Starting value 2.0: 2 friction-time-constants per second means
 * ~63 % of velocity bleeds off per 0.5 s. Tuned with `DECEL_ONSET_*`
 * to land smoothly at the angular gate. Subject to R6-F.
 */
const FRICTION_RATE = 2.0;

/**
 * Decel-onset angular-radius ratio — dimensionless. When
 * `currentAngularRadiusRad / targetAngularRadiusRad` exceeds this,
 * force drops to 0 and friction-only phase begins. Camera coasts
 * toward target gate on momentum.
 *
 * Starting value 3.0 (wave-file spec): the gate triggers at ratio
 * = 1, so a threshold of 3.0 means the explicit force-cutoff phase
 * does NOT engage before natural arrival — the camera relies on
 * the velocity cap + friction to decelerate as remaining distance
 * shrinks. Math: at terminal velocity v = MAX_VELOCITY_FACTOR ×
 * distance, friction force = FRICTION_RATE × v = 0.6 × distance,
 * which exceeds the initial force = INITIAL_FORCE_FACTOR × distance
 * = 0.5 × distance. So the system's natural equilibrium velocity is
 * v_eq = INITIAL_FORCE_FACTOR / FRICTION_RATE × distance = 0.25 ×
 * distance, well below vmax. As distance shrinks the equilibrium
 * shrinks proportionally — that IS the decel.
 *
 * R6-F may tune this down (e.g. to 0.5 or 1/3) if empirical sweep
 * shows the natural decel is too soft and the camera arrives faster
 * than the 4-6 s wave-file Acceptance §1 target. At ratio < 1, the
 * cutoff engages BEFORE the gate, giving the camera a friction-only
 * coast tail.
 */
const DECEL_ONSET_ANGULAR_RADIUS_RATIO = 3.0;

/**
 * Lower bound on velocity magnitude during the friction-only phase
 * before we declare the camera "stuck". If decel undershoots and
 * the camera halts before reaching the gate (would happen for very
 * tight tuning combinations), we still need to terminate. Tested
 * against `< STUCK_VELOCITY_WU_PER_S × distanceToTarget`
 * (distance-relative — close-target stuck vs far-target stuck have
 * different magnitudes). R6-F may revise.
 */
const STUCK_VELOCITY_RELATIVE = 1e-4;

/**
 * R6-E — telemetry ring buffer (debug-only, removed at R6 close).
 *
 * When `window.__ATLAS_DEBUG_HYG_PHYSICS__ === true` (set BEFORE the
 * fly-to triggers — typically pasted into devtools), each `update()`
 * appends a frame to `telemetry`. The same buffer is exposed at
 * `window.__ATLAS_HYG_PHYSICS_TELEMETRY__` for inspection. Ring-
 * buffered at `TELEMETRY_BUFFER_SIZE = 600` (10 s @ 60 fps) so a
 * runaway flight doesn't allocate unbounded memory.
 *
 * Scope: temporary scaffolding for R6-F empirical sweep at named
 * anchors. **Removed in the R6-H close commit** (per L37 — temp
 * dev diagnostics must not ship beyond their wave). The window-flag
 * gate keeps the runtime cost to a single `if` check when the
 * production user has not opted in.
 */
const TELEMETRY_BUFFER_SIZE = 600;

interface HygPhysicsTelemetryFrame {
  t: number;
  velocityMagnitude: number;
  currentAngularRadiusRad: number;
  distanceToTarget: number;
  forceMagnitude: number;
  frictionMagnitude: number;
  done: boolean;
}

let telemetry: HygPhysicsTelemetryFrame[] | null = null;

const isTelemetryEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __ATLAS_DEBUG_HYG_PHYSICS__?: boolean })
      .__ATLAS_DEBUG_HYG_PHYSICS__
  );
};

const exposeTelemetry = (): void => {
  if (typeof window === "undefined") return;
  (
    window as unknown as {
      __ATLAS_HYG_PHYSICS_TELEMETRY__?: HygPhysicsTelemetryFrame[] | null;
    }
  ).__ATLAS_HYG_PHYSICS_TELEMETRY__ = telemetry;
};

const recordTelemetry = (frame: HygPhysicsTelemetryFrame): void => {
  if (!telemetry) return;
  telemetry.push(frame);
  if (telemetry.length > TELEMETRY_BUFFER_SIZE) {
    telemetry.shift();
  }
};

export interface HygPhysicsFlightSpec {
  /** Current camera world position (the integrator's start state). */
  startPos: THREE.Vector3;
  /** Star world position. The integrator runs until either the
   *  angular gate triggers or we get within numerical proximity. */
  targetPos: THREE.Vector3;
  /** Apparent angular radius (radians) at which the integrator
   *  declares completion. Wired from `computeAtlasFlightLanding(...)
   *  .target.angularRadiusRad` (M2.5 S1, post-Codex round-3 angular-
   *  radius math). Mesh-spawn floor + Gaia-adaptive curve are
   *  baked in upstream. */
  targetAngularRadiusRad: number;
  /** Star physical radius in atlas world units. Same path as
   *  `HygStellarMesh` (T6.3-β / T6.3-δ), threaded through M2.5 S1.
   *  Used per frame to compute `currentAngularRadiusRad =
   *  radiusWu / distanceToTarget` for the gate check. */
  radiusWu: number;
  /** Fires on natural arrival (gate triggered). NOT fired by `cancel()`. */
  onComplete?: () => void;
}

export interface HygPhysicsFlightFrame {
  /** Updated camera position (caller copies onto `camera.position`). */
  position: THREE.Vector3;
  /** True when the angular gate triggered (or the stuck-velocity
   *  fallback fired). */
  done: boolean;
}

export class HygPhysicsFlight {
  private active = false;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private targetAngularRadiusRad = 0;
  private radiusWu = 0;
  private currentAngularRadiusRad = 0;
  /** Cumulative time since `start()`, seconds. R6-E telemetry-only;
   *  not used in the integrator's force/velocity math. */
  private tElapsed = 0;
  /** Captured at `start()` so `progressRaw` reports the fraction
   *  of journey complete in either flight direction. */
  private initialAngularRadiusRad = 0;
  /** Flight direction set at `start()` and held for the whole flight
   *  (matches Gaia's `go_to_object` branch-once contract — the loop
   *  doesn't switch mid-flight even if friction overshoots). +1 =
   *  forward (camera too FAR, must close in); -1 = backward (camera
   *  too CLOSE, must back out to landing distance). */
  private direction: 1 | -1 = 1;
  private onComplete?: () => void;

  /** Reusable scratch vectors so per-frame `update()` allocates
   *  nothing in the steady state. */
  private readonly tmpToTarget = new THREE.Vector3();
  private readonly tmpForceVec = new THREE.Vector3();
  private readonly tmpFrictionVec = new THREE.Vector3();
  private readonly tmpAccelVec = new THREE.Vector3();
  private readonly tmpVelStep = new THREE.Vector3();

  start(spec: HygPhysicsFlightSpec): void {
    this.position.copy(spec.startPos);
    this.targetPos.copy(spec.targetPos);
    this.velocity.set(0, 0, 0);
    this.targetAngularRadiusRad = Math.max(spec.targetAngularRadiusRad, 0);
    this.radiusWu = Math.max(spec.radiusWu, 0);
    const initialDist = this.position.distanceTo(this.targetPos);
    this.currentAngularRadiusRad =
      initialDist > 0 ? this.radiusWu / initialDist : 0;
    this.initialAngularRadiusRad = this.currentAngularRadiusRad;
    // Direction selection mirrors Gaia's `InteractiveCameraModule.
    // go_to_object` (`InteractiveCameraModule.java:172-200`):
    // forward when current apparent angle is BELOW target
    // (camera too far, close in); backward when current is ABOVE
    // target (camera too close, back out to landing distance).
    // Codex audit 2026-05-06 P1 caught the missing backward branch
    // — without it, the camera-rebound case (clicking a HYG star
    // from inside the gate distance) would terminate immediately
    // at the too-close position instead of backing out to the M2.5
    // landing pose.
    this.direction =
      this.currentAngularRadiusRad < this.targetAngularRadiusRad ? 1 : -1;
    this.tElapsed = 0;
    this.onComplete = spec.onComplete;
    this.active = true;
    // R6-E telemetry: reset buffer per fly-to so each empirical
    // run starts clean. No-op when the debug flag is off.
    telemetry = isTelemetryEnabled() ? [] : null;
    exposeTelemetry();
  }

  /** Advance one frame. Caller passes R3F's measured `delta` (seconds);
   *  semi-implicit Euler is symplectic so a fixed timestep is not
   *  required. Returns `null` when inactive. */
  update(dt: number): HygPhysicsFlightFrame | null {
    if (!this.active) return null;
    if (!Number.isFinite(dt) || dt <= 0) {
      // Defensive: a zero-or-negative dt (e.g. tab regained focus
      // with `requestAnimationFrame` clock skew) shouldn't crash
      // the integrator — return current frame untouched. R3F may
      // emit a 0-dt frame on the first tick after suspend.
      return { position: this.position, done: false };
    }

    this.tElapsed += dt;

    // 1. Direction and remaining distance to target.
    this.tmpToTarget.subVectors(this.targetPos, this.position);
    const distanceToTarget = this.tmpToTarget.length();
    if (distanceToTarget <= 0) {
      // Already at target (degenerate — shouldn't happen with the
      // angular-gate guard, but defend against it). Mark done.
      this.completeNaturally();
      return { position: this.position, done: true };
    }
    // Force direction = unit vector toward (forward) or away from
    // (backward) the target. Gate semantics flip accordingly below.
    this.tmpForceVec
      .copy(this.tmpToTarget)
      .divideScalar(distanceToTarget)
      .multiplyScalar(this.direction);

    // 2. Friction = -FRICTION_RATE × velocity. Linear decay (game
    //    physics canon).
    this.tmpFrictionVec.copy(this.velocity).multiplyScalar(-FRICTION_RATE);

    // 3. Force magnitude: ramp-up from rest until decel-onset gate.
    //    Past the gate, force = 0 and friction alone decelerates.
    //    Decel-onset condition is direction-aware: forward triggers
    //    when angularRatio grows past the threshold; backward when
    //    it shrinks past 1/threshold (same proportional distance to
    //    gate, opposite sign).
    const angularRatio =
      this.targetAngularRadiusRad > 0
        ? this.currentAngularRadiusRad / this.targetAngularRadiusRad
        : 0;
    const inDecelPhase =
      this.direction === 1
        ? angularRatio > DECEL_ONSET_ANGULAR_RADIUS_RATIO
        : angularRatio < 1 / DECEL_ONSET_ANGULAR_RADIUS_RATIO;
    const forceMagnitude = inDecelPhase
      ? 0
      : INITIAL_FORCE_FACTOR * distanceToTarget;

    // 4. Total acceleration = force·dir + friction.
    this.tmpAccelVec
      .copy(this.tmpForceVec)
      .multiplyScalar(forceMagnitude)
      .add(this.tmpFrictionVec);

    // 5. Semi-implicit Euler step:  v += a·dt;  pos += v·dt.
    this.velocity.addScaledVector(this.tmpAccelVec, dt);

    // 6. Cap velocity by remaining-distance heuristic (dynamic
    //    terminal velocity that shrinks as we approach the target
    //    in forward, or as we recede from it in backward — both use
    //    `distanceToTarget` as the scale).
    const maxVelocity = MAX_VELOCITY_FACTOR * distanceToTarget;
    if (this.velocity.lengthSq() > maxVelocity * maxVelocity) {
      this.velocity.setLength(maxVelocity);
    }

    this.tmpVelStep.copy(this.velocity).multiplyScalar(dt);
    this.position.add(this.tmpVelStep);

    // 7. Recompute angular radius for the gate check.
    const newDistanceToTarget = this.position.distanceTo(this.targetPos);
    this.currentAngularRadiusRad =
      newDistanceToTarget > 0 ? this.radiusWu / newDistanceToTarget : 0;

    // Gate semantics flip with direction. Forward: camera grew TO
    // target (currentRadius >= target). Backward: camera shrank
    // TO target (currentRadius <= target).
    const gateReached =
      this.targetAngularRadiusRad > 0 &&
      (this.direction === 1
        ? this.currentAngularRadiusRad >= this.targetAngularRadiusRad
        : this.currentAngularRadiusRad <= this.targetAngularRadiusRad);

    // 8. Stuck-velocity fallback: friction killed all velocity but
    //    the gate hasn't triggered (tuning undershoot). Terminate
    //    rather than coast forever.
    const stuck =
      inDecelPhase &&
      this.velocity.lengthSq() <
        STUCK_VELOCITY_RELATIVE *
          STUCK_VELOCITY_RELATIVE *
          newDistanceToTarget *
          newDistanceToTarget;

    const done = gateReached || stuck;

    // R6-E telemetry: per-frame state snapshot for empirical sweep.
    // No-op when the debug flag is off (telemetry === null).
    recordTelemetry({
      t: this.tElapsed,
      velocityMagnitude: this.velocity.length(),
      currentAngularRadiusRad: this.currentAngularRadiusRad,
      distanceToTarget: newDistanceToTarget,
      forceMagnitude,
      frictionMagnitude: this.tmpFrictionVec.length(),
      done,
    });

    if (done) {
      this.completeNaturally();
      return { position: this.position, done: true };
    }
    return { position: this.position, done: false };
  }

  /** Full stop: velocity=0, returns the frozen position. Inactive
   *  after. Does NOT fire `onComplete` (cancel ≠ complete). */
  cancel(): { position: THREE.Vector3 } | null {
    if (!this.active) return null;
    this.velocity.set(0, 0, 0);
    this.active = false;
    return { position: this.position };
  }

  get isActive(): boolean {
    return this.active;
  }

  /**
   * Progress signal for M3 cross-fade ramp. Returns the fraction of
   * angular-radius journey complete in `[0, 1]`, direction-agnostic.
   * 0 = no movement (`currentAngularRadius == initialAngularRadius`).
   * 1 = at gate (`currentAngularRadius == targetAngularRadius`).
   * Replaces round-5's `posProgressRaw` (time-fraction) which had no
   * meaning under gate-driven physics. Monotonically non-decreasing
   * modulo integrator jitter and aligned with apparent-size journey
   * regardless of forward/backward direction — that's the ramp axis
   * M3 wants for cross-fading the procedural mesh in.
   */
  get progressRaw(): number {
    if (!this.active || this.targetAngularRadiusRad <= 0) return 0;
    const denom = Math.abs(
      this.initialAngularRadiusRad - this.targetAngularRadiusRad
    );
    if (denom <= 0) return 1;
    const traveled = Math.abs(
      this.currentAngularRadiusRad - this.initialAngularRadiusRad
    );
    const ratio = traveled / denom;
    return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  }

  private completeNaturally(): void {
    this.active = false;
    const cb = this.onComplete;
    this.onComplete = undefined;
    cb?.();
  }
}

/** Calibration constants exposed for tests + R6-F empirical sweep
 *  reasoning. Not for runtime tuning — change the source constants
 *  themselves and re-pin tests. */
export const HYG_PHYSICS_CALIBRATION = {
  INITIAL_FORCE_FACTOR,
  MAX_VELOCITY_FACTOR,
  FRICTION_RATE,
  DECEL_ONSET_ANGULAR_RADIUS_RATIO,
  STUCK_VELOCITY_RELATIVE,
} as const;

/**
 * Test-only escape hatch — clears the telemetry buffer + window
 * exposure so cross-test bleed doesn't accumulate. Same pattern as
 * `__resetHygFlightPosProgress` (`hygFlightPosProgress.ts:65`).
 */
export const __resetHygPhysicsTelemetry = (): void => {
  telemetry = null;
  exposeTelemetry();
};
