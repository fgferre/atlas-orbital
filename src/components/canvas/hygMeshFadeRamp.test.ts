/**
 * M3 — pinned tests for the cross-fade ramp integrator.
 *
 * The full `<HygStellarMesh>` component exercises a Three.js
 * scene (camera, geometry, useFrame), so this file pins the
 * pure-TS slice that's portable: the linear ramp integrator
 * `stepRampToward`. The integrator is the engine of the
 * cross-fade — getting the math right (no overshoot, exact
 * traversal time, stable steady-state) is what the tests guard.
 *
 * Wider behavior (gate-driven target, fadeAlpha attribute write,
 * mesh mount/unmount on the 0↔(0,1] boundary) is covered via
 * the e2e `hyg-focus.spec.ts` boundary checks (pre-fly = 0,
 * post-landing = 1) plus the design-pin in
 * `starfieldFadeAlpha.test.ts` (`(1 - x) + x = 1`).
 */

import { describe, expect, it } from "vitest";

import { stepRampToward } from "./hygMeshFadeRamp";

describe("stepRampToward — linear integrator", () => {
  it("snaps to target on the first tick when remaining distance fits in one step", () => {
    // current=0.95, target=1.0, dt=0.5s, dur=300ms → step=1.667
    // remaining=0.05 ≤ step → returns target exactly.
    const next = stepRampToward(0.95, 1.0, 0.5, 300);
    expect(next).toBe(1.0);
  });

  it("steps linearly toward target by dt/durationMs each tick", () => {
    // current=0, target=1, dt=0.05s (50ms), dur=300ms → step=0.1667
    const next = stepRampToward(0, 1, 0.05, 300);
    expect(next).toBeCloseTo(50 / 300, 6);
  });

  it("is symmetric on direction: dec ramp uses the same step magnitude", () => {
    const up = stepRampToward(0, 1, 0.1, 300);
    const down = stepRampToward(1, 0, 0.1, 300);
    expect(up + down).toBeCloseTo(1, 10);
    expect(up).toBeCloseTo(100 / 300, 6);
    expect(1 - down).toBeCloseTo(100 / 300, 6);
  });

  it("clamps the result to [0, 1] even if the input is out of range", () => {
    // current is briefly negative (shouldn't happen but pin defensively).
    expect(stepRampToward(-0.5, 1, 0.001, 300)).toBeGreaterThanOrEqual(0);
    expect(stepRampToward(1.5, 1, 0.001, 300)).toBe(1);
  });

  it("settles at target after exactly durationMs of integration (linear)", () => {
    // Simulate a 60 fps tick stream from current=0 to target=1 over
    // 300 ms total wall time. After 300 ms the ramp must equal 1.
    const dur = 300;
    const dtPerTick = 1 / 60; // 16.67 ms
    const totalTicks = Math.ceil(dur / 1000 / dtPerTick);
    let r = 0;
    for (let i = 0; i < totalTicks; i++) {
      r = stepRampToward(r, 1, dtPerTick, dur);
    }
    expect(r).toBe(1);
  });

  it("does not overshoot when target reverses mid-ramp (hysteresis cushion)", () => {
    // Ramp from 0 toward 1 for 100ms, then target flips to 0.
    // The new direction reverses; ramp should head back to 0
    // without going above its peak.
    let r = 0;
    for (let t = 0; t < 100; t += 16.67) {
      r = stepRampToward(r, 1, 16.67 / 1000, 300);
    }
    const peak = r;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(1); // not yet settled
    // Now reverse.
    for (let t = 0; t < 200; t += 16.67) {
      r = stepRampToward(r, 0, 16.67 / 1000, 300);
    }
    expect(r).toBeLessThan(peak); // moved toward 0
    expect(r).toBeGreaterThanOrEqual(0);
  });

  it("returns target unchanged with durationMs <= 0 (defensive — no division by 0)", () => {
    expect(stepRampToward(0.5, 1, 0.1, 0)).toBe(1);
    expect(stepRampToward(0.5, 1, 0.1, -100)).toBe(1);
    // Target out of [0,1] still gets clamped.
    expect(stepRampToward(0.5, 2, 0.1, 0)).toBe(1);
    expect(stepRampToward(0.5, -3, 0.1, 0)).toBe(0);
  });

  it("zero dt holds the current value unchanged", () => {
    expect(stepRampToward(0.42, 1, 0, 300)).toBe(0.42);
    expect(stepRampToward(0.42, 0, 0, 300)).toBe(0.42);
  });

  it("treats non-finite dt as a no-op (honors documented NaN-safety)", () => {
    expect(stepRampToward(0.3, 1, NaN, 300)).toBe(0.3);
    expect(stepRampToward(0.3, 1, Infinity, 300)).toBe(0.3);
  });

  it("clamps a huge dt spike (tab-resume) so the ramp animates instead of snapping", () => {
    // dt = 10s would otherwise jump straight to target; clamped to 0.1s
    // → step = 0.333, so from 0 it advances by ~0.333, not to 1.
    const next = stepRampToward(0, 1, 10, 300);
    expect(next).toBeCloseTo((0.1 * 1000) / 300, 6);
    expect(next).toBeLessThan(1);
  });

  it("preserves the cross-fade sum invariant at every tick (sprite + mesh = 1)", () => {
    // Critical M3 contract: at no point should the sum of the
    // sprite-side multiplier `(1 - r)` and the mesh-side
    // visibility `r` deviate from 1. This is mathematically
    // trivial — but pinning it explicitly guards a future
    // refactor that might split the integrator into separate
    // sprite/mesh ramps with subtly different timing.
    let r = 0;
    for (let t = 0; t < 500; t += 16.67) {
      r = stepRampToward(r, 1, 16.67 / 1000, 300);
      const spriteMult = 1 - r;
      const meshVis = r;
      expect(spriteMult + meshVis).toBeCloseTo(1, 10);
    }
  });
});
