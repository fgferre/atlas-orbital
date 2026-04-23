import { describe, expect, it } from "vitest";

import {
  addZoomImpulse,
  applyZoomFriction,
  consumeZoomVelocity,
  ZOOM_FRICTION_PER_SECOND,
  ZOOM_IMPULSE_PER_STEP,
  ZOOM_VELOCITY_DEADZONE,
} from "./zoomPhysics";

describe("zoomPhysics", () => {
  it("pins the impulse, friction, and deadzone constants", () => {
    expect(ZOOM_IMPULSE_PER_STEP).toBeCloseTo(4.0, 6);
    expect(ZOOM_FRICTION_PER_SECOND).toBeCloseTo(8.0, 6);
    expect(ZOOM_VELOCITY_DEADZONE).toBeCloseTo(0.1, 6);
  });

  describe("addZoomImpulse", () => {
    it("scales delta steps by ZOOM_IMPULSE_PER_STEP", () => {
      expect(addZoomImpulse(0, 1)).toBeCloseTo(4.0, 6);
      expect(addZoomImpulse(0, -2)).toBeCloseTo(-8.0, 6);
    });

    it("accumulates onto existing velocity (multi-event flicks compose)", () => {
      const v1 = addZoomImpulse(0, 1); // 4
      const v2 = addZoomImpulse(v1, 1); // 8
      const v3 = addZoomImpulse(v2, -1); // 4
      expect(v2).toBeCloseTo(8, 6);
      expect(v3).toBeCloseTo(4, 6);
    });

    it("supports fractional impulses (sub-detent wheel deltas)", () => {
      expect(addZoomImpulse(0, 0.5)).toBeCloseTo(2.0, 6);
    });
  });

  describe("applyZoomFriction", () => {
    it("returns the input unchanged at dt = 0", () => {
      expect(applyZoomFriction(10, 0)).toBeCloseTo(10, 6);
    });

    it("decays velocity exponentially toward zero", () => {
      const decayed = applyZoomFriction(10, 1 / 60);
      // exp(-8 / 60) ≈ 0.8752 → 10 × 0.8752 = 8.752
      expect(decayed).toBeCloseTo(10 * Math.exp(-8 / 60), 6);
      expect(decayed).toBeLessThan(10);
      expect(decayed).toBeGreaterThan(0);
    });

    it("preserves sign on negative velocity", () => {
      expect(applyZoomFriction(-5, 1 / 60)).toBeLessThan(0);
      expect(applyZoomFriction(-5, 1 / 60)).toBeCloseTo(
        -5 * Math.exp(-8 / 60),
        6
      );
    });

    it("does not overshoot zero on long dt (closed-form vs linear)", () => {
      // At dt = 1 the linear form `v × (1 - friction × dt)` would be
      // 10 × (1 - 8) = -70 (sign flip). The closed form decays
      // monotonically toward 0 without sign change.
      const result = applyZoomFriction(10, 1);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(0.01); // ~ 10 × exp(-8) = 0.00335
    });
  });

  describe("consumeZoomVelocity", () => {
    it("returns zero velocity + zero steps at rest", () => {
      const { nextVelocity, frameSteps } = consumeZoomVelocity(0, 1 / 60);
      expect(nextVelocity).toBe(0);
      expect(frameSteps).toBe(0);
    });

    it("snaps below-deadzone velocities to zero", () => {
      const tiny = ZOOM_VELOCITY_DEADZONE * 0.5;
      const { nextVelocity, frameSteps } = consumeZoomVelocity(tiny, 1 / 60);
      expect(nextVelocity).toBe(0);
      expect(frameSteps).toBe(0);
    });

    it("snaps below-deadzone NEGATIVE velocities to zero (symmetric)", () => {
      const tinyNeg = -ZOOM_VELOCITY_DEADZONE * 0.5;
      const { nextVelocity, frameSteps } = consumeZoomVelocity(tinyNeg, 1 / 60);
      expect(nextVelocity).toBe(0);
      expect(frameSteps).toBe(0);
    });

    it("returns post-friction velocity + frameSteps for an active flick", () => {
      const dt = 1 / 60;
      const { nextVelocity, frameSteps } = consumeZoomVelocity(10, dt);
      const expected = 10 * Math.exp(-8 / 60);
      expect(nextVelocity).toBeCloseTo(expected, 6);
      expect(frameSteps).toBeCloseTo(expected * dt, 6);
    });

    it("eventually drops to zero across multi-frame integration (decay convergence)", () => {
      let velocity = 4; // single impulse
      let totalSteps = 0;
      for (let i = 0; i < 600; i++) {
        // 10 s @ 60 Hz
        const result = consumeZoomVelocity(velocity, 1 / 60);
        velocity = result.nextVelocity;
        totalSteps += result.frameSteps;
        if (velocity === 0) break;
      }
      expect(velocity).toBe(0);
      // Single impulse should produce roughly 0.5 zoom steps total
      // (integral of `4 × exp(-8t)` from 0 to ∞ is 0.5).
      expect(totalSteps).toBeGreaterThan(0.4);
      expect(totalSteps).toBeLessThan(0.55);
    });
  });
});
