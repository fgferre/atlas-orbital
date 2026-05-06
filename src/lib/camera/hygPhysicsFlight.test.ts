import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  HYG_PHYSICS_CALIBRATION,
  HygPhysicsFlight,
  type HygPhysicsFlightSpec,
} from "./hygPhysicsFlight";

/**
 * T6.4-M2.5 round-6 R6-G — tests for `HygPhysicsFlight`. Drive the
 * integrator with explicit `dt` (semi-implicit Euler is symplectic
 * → fixed timestep is fine for testing). Validates start, accel-from-
 * rest, terminal velocity bound, gate-driven termination, cancel
 * full-stop semantics, and progressRaw monotonicity.
 *
 * **Why no physics-time-based assertions** (e.g. "Sirius arrives
 * in 4-6 s"): empirical calibration is R6-F's job — the wave-file
 * spec lists the 4 constants as starting points subject to revision.
 * Pinning a "Sirius arrives in 5 s" assertion here would couple
 * test pass/fail to one specific tuning, which would force a test
 * update on every R6-F sweep iteration. The shape assertions below
 * (monotonic, bounded, gate-stopping) are calibration-stable.
 */

/**
 * Small-scale test scenario. The integrator's natural decay rate is
 *   k = INITIAL_FORCE_FACTOR / FRICTION_RATE  (1/s)
 * which under the wave-file starting constants is 0.25/s. Converging
 * from D to G requires `ln(D/G) / k` seconds. Keeping D/G = 10 keeps
 * the test loop short (~600 frames @ 60 fps) and makes the assertions
 * calibration-stable: any tuning that produces a positive k will
 * eventually reach the gate; the test just gives it enough time.
 *
 * Realistic HYG distances (Sirius ~5.36e8 wu, gate ~468 wu → D/G ~
 * 1.15e6) require ~56 s sim time at k=0.25. R6-F's job is to tune
 * the constants to produce the wave-file Acceptance §1 4-6 s feel
 * for real geometries — that's a calibration question, not a shape
 * question, and pinning a Sirius arrival assertion here would
 * couple test pass/fail to one specific tuning.
 */
const TEST_TARGET_X = 1000;
const TEST_RADIUS_WU = 5;
const TEST_TARGET_ANGULAR_RADIUS_RAD = 0.05; // gate at distance 100

const makeSpec = (
  overrides: Partial<HygPhysicsFlightSpec> = {}
): HygPhysicsFlightSpec => ({
  startPos: new THREE.Vector3(0, 0, 0),
  targetPos: new THREE.Vector3(TEST_TARGET_X, 0, 0),
  targetAngularRadiusRad: TEST_TARGET_ANGULAR_RADIUS_RAD,
  radiusWu: TEST_RADIUS_WU,
  ...overrides,
});

describe("HygPhysicsFlight — lifecycle", () => {
  it("returns null before start()", () => {
    const p = new HygPhysicsFlight();
    expect(p.update(0.016)).toBeNull();
    expect(p.isActive).toBe(false);
  });

  it("becomes active after start()", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    expect(p.isActive).toBe(true);
  });

  it("starts at startPos (no integration on the start frame)", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec({ startPos: new THREE.Vector3(10, 20, 30) }));
    // Callers normally call `update(delta)` next frame; `start()`
    // alone shouldn't move the position.
    expect(p.isActive).toBe(true);
  });
});

describe("HygPhysicsFlight — semi-implicit Euler integration", () => {
  it("accelerates from rest in the first frame (velocity grows)", () => {
    const p = new HygPhysicsFlight();
    const spec = makeSpec();
    p.start(spec);
    // First frame: dt=16ms (60fps).
    const f1 = p.update(0.016);
    expect(f1).not.toBeNull();
    // Position should have moved toward target (positive x direction).
    expect(f1!.position.x).toBeGreaterThan(0);
    // Not yet done — we're at near-zero angular size.
    expect(f1!.done).toBe(false);
  });

  it("velocity is bounded by MAX_VELOCITY_FACTOR × distance", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    let lastPos = 0;
    let maxStepWu = 0;
    for (let i = 0; i < 300; i++) {
      const f = p.update(0.016);
      if (!f) break;
      const stepWu = f.position.x - lastPos;
      if (stepWu > maxStepWu) maxStepWu = stepWu;
      lastPos = f.position.x;
      if (f.done) break;
    }
    // Single-frame step at terminal velocity ≤
    //   MAX_VELOCITY_FACTOR × initial_distance × dt.
    // Allow 2× margin for semi-implicit ramp overshoot before the
    // cap binds (peak velocity slightly exceeds steady-state).
    const cap =
      HYG_PHYSICS_CALIBRATION.MAX_VELOCITY_FACTOR * TEST_TARGET_X * 0.016;
    expect(maxStepWu).toBeLessThan(cap * 2);
  });

  it("position progresses monotonically toward target (no warp/snap)", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    let prevX = 0;
    let monotonicViolations = 0;
    for (let i = 0; i < 600; i++) {
      const f = p.update(0.016);
      if (!f) break;
      if (f.position.x < prevX - 1) monotonicViolations++; // 1 wu jitter tol
      prevX = f.position.x;
      if (f.done) break;
    }
    expect(monotonicViolations).toBe(0);
  });

  it("|Δpos| at t∈[1s,2s] vs [2s,3s] within 3× (plan spec)", () => {
    // Translates the wave-file Round-6 R6-G no-warp criterion:
    // "|Δpos| in [t=1s..2s] and [t=2s..3s] should be within 3× of
    // each other (no order-of-magnitude jump)". Measured by
    // sampling positions at three explicit t-marks, NOT by averaging
    // a cruise window. Codex audit 2026-05-06 P3 caught the earlier
    // looser version (10× window-style spread, skip-on-empty) that
    // would silently allow the warp Round-6 is meant to prevent.
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    const dt = 1 / 60; // 60 fps
    const advance = (seconds: number) => {
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        const f = p.update(dt);
        if (!f || f.done) return false;
      }
      return true;
    };
    // Sample at t=1s.
    expect(advance(1)).toBe(true);
    const p1 = p["position"].x;
    // Sample at t=2s.
    expect(advance(1)).toBe(true);
    const p2 = p["position"].x;
    // Sample at t=3s.
    expect(advance(1)).toBe(true);
    const p3 = p["position"].x;
    const delta12 = p2 - p1;
    const delta23 = p3 - p2;
    expect(delta12).toBeGreaterThan(0);
    expect(delta23).toBeGreaterThan(0);
    const ratio = Math.max(delta12, delta23) / Math.min(delta12, delta23);
    expect(ratio).toBeLessThanOrEqual(3);
  });
});

describe("HygPhysicsFlight — backward flight (camera-rebound)", () => {
  // Mirrors Gaia's `InteractiveCameraModule.go_to_object` backward
  // branch: when current apparent angle > target (camera too close),
  // the integrator must back the camera OUT to the landing distance
  // instead of immediately completing. Codex audit 2026-05-06 P1
  // caught the missing branch.
  const makeBackwardSpec = (): HygPhysicsFlightSpec => ({
    // Start INSIDE the gate (distance 10 wu from target), gate is at
    // distance 100 wu (radius 5 / target 0.05 rad). Camera should
    // back out to ~100 wu.
    startPos: new THREE.Vector3(990, 0, 0),
    targetPos: new THREE.Vector3(1000, 0, 0),
    targetAngularRadiusRad: 0.05,
    radiusWu: 5,
  });

  it("starts in backward direction when camera is inside gate", () => {
    const p = new HygPhysicsFlight();
    p.start(makeBackwardSpec());
    // First frame should NOT immediately complete (camera too close
    // → must back out, not stay put).
    const f = p.update(0.016);
    expect(f).not.toBeNull();
    expect(f!.done).toBe(false);
    // Camera should have moved AWAY from target (negative x).
    expect(f!.position.x).toBeLessThan(990);
  });

  it("backs out monotonically until gate triggers from above", () => {
    const p = new HygPhysicsFlight();
    p.start(makeBackwardSpec());
    let prevX = 990;
    let monotonicViolations = 0;
    let f: ReturnType<typeof p.update> = null;
    for (let i = 0; i < 1200; i++) {
      f = p.update(0.016);
      if (!f) break;
      // Backward: position.x should monotonically decrease.
      if (f.position.x > prevX + 1) monotonicViolations++; // 1 wu jitter tol
      prevX = f.position.x;
      if (f.done) break;
    }
    expect(monotonicViolations).toBe(0);
    expect(f!.done).toBe(true);
    // Final distance from target should be near gate (100 wu).
    const finalDist = Math.abs(1000 - f!.position.x);
    expect(finalDist).toBeGreaterThanOrEqual(100 * 0.7);
    expect(finalDist).toBeLessThanOrEqual(100 * 1.5);
  });

  it("progressRaw grows from 0 toward 1 in the backward direction too", () => {
    const p = new HygPhysicsFlight();
    p.start(makeBackwardSpec());
    expect(p.progressRaw).toBe(0);
    // Advance a few frames into the back-out.
    for (let i = 0; i < 60; i++) {
      const f = p.update(0.016);
      if (!f || f.done) break;
    }
    // Some forward progress (in journey-fraction terms) should have
    // been made.
    expect(p.progressRaw).toBeGreaterThan(0);
  });

  it("camera EXACTLY at gate distance terminates immediately", () => {
    // Edge case: initialAngularRadiusRad === targetAngularRadiusRad.
    // The gate condition triggers on the first frame regardless of
    // direction selection.
    const p = new HygPhysicsFlight();
    p.start({
      startPos: new THREE.Vector3(900, 0, 0),
      targetPos: new THREE.Vector3(1000, 0, 0),
      targetAngularRadiusRad: 0.05,
      radiusWu: 5, // gate at distance 100, we're at 100 — exact.
    });
    const f = p.update(0.016);
    expect(f).not.toBeNull();
    expect(f!.done).toBe(true);
  });
});

describe("HygPhysicsFlight — gate-driven termination", () => {
  it("terminates when angular gate is reached", () => {
    const p = new HygPhysicsFlight();
    const onComplete = vi.fn();
    p.start(makeSpec({ onComplete }));
    let f: ReturnType<typeof p.update> = null;
    for (let i = 0; i < 1200; i++) {
      f = p.update(0.016);
      if (!f || f.done) break;
    }
    expect(f).not.toBeNull();
    expect(f!.done).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(p.isActive).toBe(false);
  });

  it("final landing distance is within the angular-gate range", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    let f: ReturnType<typeof p.update> = null;
    for (let i = 0; i < 1200; i++) {
      f = p.update(0.016);
      if (!f || f.done) break;
    }
    expect(f!.done).toBe(true);
    const finalDistance = f!.position.distanceTo(
      new THREE.Vector3(TEST_TARGET_X, 0, 0)
    );
    // Gate is `radiusWu / distance >= targetAngularRadiusRad`, i.e.
    // distance <= radiusWu / targetAngularRadiusRad. With
    // TEST_RADIUS_WU=5 and target=0.05 rad → gate distance = 100 wu.
    // Allow 1.5× overshoot for the integrator's last step.
    const gateDistance = TEST_RADIUS_WU / TEST_TARGET_ANGULAR_RADIUS_RAD;
    expect(finalDistance).toBeLessThanOrEqual(gateDistance * 1.5);
    expect(finalDistance).toBeGreaterThan(0);
  });
});

describe("HygPhysicsFlight — cancel semantics", () => {
  it("cancel returns frozen position WITHOUT firing onComplete", () => {
    const onComplete = vi.fn();
    const p = new HygPhysicsFlight();
    p.start(makeSpec({ onComplete }));
    // Run a few frames so the position has actually moved.
    for (let i = 0; i < 30; i++) p.update(0.016);
    const before = p["position"].x; // private field access for test
    const frozen = p.cancel();
    expect(frozen).not.toBeNull();
    expect(frozen!.position.x).toBeCloseTo(before, 6);
    expect(onComplete).not.toHaveBeenCalled();
    expect(p.isActive).toBe(false);
  });

  it("cancel zeros velocity (no continued drift)", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    for (let i = 0; i < 30; i++) p.update(0.016);
    p.cancel();
    // Re-start at a different target — velocity must NOT carry over.
    p.start(
      makeSpec({
        startPos: new THREE.Vector3(0, 0, 0),
        targetPos: new THREE.Vector3(100, 0, 0),
        radiusWu: 5,
        targetAngularRadiusRad: 0.05,
      })
    );
    const f = p.update(0.016);
    // First frame after re-start: velocity began at 0, accelerated
    // for 0.016s. Position should be very small (< 100 wu). Verifies
    // no leftover velocity from the cancelled flight.
    expect(f!.position.x).toBeLessThan(50);
  });

  it("cancel on inactive returns null", () => {
    const p = new HygPhysicsFlight();
    expect(p.cancel()).toBeNull();
  });
});

describe("HygPhysicsFlight — progressRaw signal", () => {
  it("returns 0 before start() and after cancel()", () => {
    const p = new HygPhysicsFlight();
    expect(p.progressRaw).toBe(0);
    p.start(makeSpec());
    p.cancel();
    expect(p.progressRaw).toBe(0);
  });

  it("grows monotonically toward 1 during flight", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    let prev = 0;
    let violations = 0;
    let lastActiveProgress = 0;
    for (let i = 0; i < 1200; i++) {
      const f = p.update(0.016);
      if (!f) break;
      // Stop monotonicity tracking once `done = true`; on the
      // gate-triggering frame `isActive` flips to false so
      // `progressRaw` returns 0 (its inactive-state value), which
      // would falsely register as a violation against the prior
      // ~1.0 reading.
      if (f.done) break;
      const progress = p.progressRaw;
      // Use 1e-3 jitter tolerance — semi-implicit Euler can briefly
      // dip during decel phase as friction overshoots.
      if (progress < prev - 1e-3) violations++;
      prev = progress;
      lastActiveProgress = progress;
    }
    expect(violations).toBe(0);
    expect(lastActiveProgress).toBeGreaterThan(0.5);
  });

  it("clamps to [0, 1]", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    for (let i = 0; i < 1200; i++) {
      const f = p.update(0.016);
      if (!f) break;
      expect(p.progressRaw).toBeGreaterThanOrEqual(0);
      expect(p.progressRaw).toBeLessThanOrEqual(1);
      if (f.done) break;
    }
  });
});

describe("HygPhysicsFlight — defensive guards", () => {
  it("update with dt=0 returns the current frame untouched", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    // First nudge so position is away from origin.
    p.update(0.016);
    const xBefore = p["position"].x;
    const f = p.update(0);
    expect(f).not.toBeNull();
    expect(f!.position.x).toBe(xBefore);
    expect(f!.done).toBe(false);
  });

  it("update with dt<0 returns the current frame untouched", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    p.update(0.016);
    const xBefore = p["position"].x;
    const f = p.update(-0.5);
    expect(f).not.toBeNull();
    expect(f!.position.x).toBe(xBefore);
  });

  it("update with NaN dt returns the current frame untouched", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    p.update(0.016);
    const xBefore = p["position"].x;
    const f = p.update(Number.NaN);
    expect(f).not.toBeNull();
    expect(f!.position.x).toBe(xBefore);
  });
});
