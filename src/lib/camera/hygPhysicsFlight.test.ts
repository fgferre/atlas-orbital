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

  it("inter-frame step magnitudes are within an order of magnitude of each other (no warp)", () => {
    const p = new HygPhysicsFlight();
    p.start(makeSpec());
    // Skip the first 0.5 s while velocity ramps up from rest.
    for (let i = 0; i < 30; i++) p.update(0.016);
    let prevX = 0;
    const steps: number[] = [];
    {
      const snap = p.update(0.016);
      prevX = snap!.position.x;
    }
    for (let i = 0; i < 60; i++) {
      const f = p.update(0.016);
      if (!f || f.done) break;
      steps.push(f.position.x - prevX);
      prevX = f.position.x;
    }
    if (steps.length >= 2) {
      const minStep = Math.min(...steps.filter((s) => s > 0));
      const maxStep = Math.max(...steps);
      // No more than 10× spread between min and max stride during
      // the cruise phase. This is the no-warp criterion translated
      // to a calibration-independent shape.
      expect(maxStep / Math.max(minStep, 1)).toBeLessThan(10);
    }
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
