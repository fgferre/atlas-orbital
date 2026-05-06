import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { OrientationLerp, type OrientationLerpSpec } from "./orientationLerp";

/**
 * T6.4-M2.5 round-6 R6-A — tests for `OrientationLerp`. Mirrors
 * `StellarFlightTransition.test.ts` orientation-channel coverage
 * but on the standalone class.
 */

const linear = (t: number): number => t;

const makeSpec = (
  overrides: Partial<OrientationLerpSpec> = {}
): OrientationLerpSpec => ({
  startTarget: new THREE.Vector3(0, 0, -1),
  endTarget: new THREE.Vector3(50, 0, 0),
  durationMs: 500,
  easing: linear,
  ...overrides,
});

describe("OrientationLerp — start + update lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null before start()", () => {
    const o = new OrientationLerp();
    expect(o.update()).toBeNull();
    expect(o.isActive).toBe(false);
  });

  it("returns initial target at t=0", () => {
    const o = new OrientationLerp();
    o.start(makeSpec());
    const f = o.update();
    expect(f).not.toBeNull();
    expect(f!.target.x).toBeCloseTo(0);
    expect(f!.target.z).toBeCloseTo(-1);
    expect(f!.done).toBe(false);
    expect(o.isActive).toBe(true);
  });

  it("reaches end at t=durationMs (linear easing)", () => {
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 500 }));
    vi.advanceTimersByTime(500);
    const f = o.update();
    expect(f).not.toBeNull();
    expect(f!.target.x).toBeCloseTo(50, 6);
    expect(f!.done).toBe(true);
    expect(o.isActive).toBe(false);
  });

  it("midpoint is exactly halfway under linear easing", () => {
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 1000 }));
    vi.advanceTimersByTime(500);
    const f = o.update();
    expect(f!.target.x).toBeCloseTo(25, 6);
    expect(f!.done).toBe(false);
  });

  it("zero durationMs completes on first update", () => {
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 0 }));
    const f = o.update();
    expect(f!.target.x).toBeCloseTo(50, 6);
    expect(f!.done).toBe(true);
    expect(o.isActive).toBe(false);
  });
});

describe("OrientationLerp — onComplete + cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onComplete on natural completion (alpha=1)", () => {
    const onComplete = vi.fn();
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 100, onComplete }));
    vi.advanceTimersByTime(100);
    o.update();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onComplete when cancelled before completion", () => {
    const onComplete = vi.fn();
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 1000, onComplete }));
    vi.advanceTimersByTime(500);
    o.cancel();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does NOT fire onComplete when cancelled AFTER duration elapsed (interrupt-vs-complete distinction)", () => {
    const onComplete = vi.fn();
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 100, onComplete }));
    vi.advanceTimersByTime(200);
    // Duration elapsed but update() not yet called → cancel must
    // not fire onComplete (matches StellarFlightTransition.cancel
    // 2026-05-05 P2 fix).
    o.cancel();
    expect(onComplete).not.toHaveBeenCalled();
    expect(o.isActive).toBe(false);
  });

  it("cancel returns the intermediate (eased) target", () => {
    const o = new OrientationLerp();
    o.start(makeSpec({ durationMs: 1000 }));
    vi.advanceTimersByTime(500);
    const frozen = o.cancel();
    expect(frozen).not.toBeNull();
    expect(frozen!.target.x).toBeCloseTo(25, 6);
  });

  it("cancel on inactive returns null", () => {
    const o = new OrientationLerp();
    expect(o.cancel()).toBeNull();
  });
});
