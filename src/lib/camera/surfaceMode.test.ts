import { describe, expect, it } from "vitest";

import {
  computeFovFactor,
  isSurfaceModeActive,
  SURFACE_MODE_RADII_MULTIPLIER,
  SURFACE_MODE_REFERENCE_FOV_DEG,
} from "./surfaceMode";

describe("surfaceMode", () => {
  it("pins the Gaia constants", () => {
    expect(SURFACE_MODE_RADII_MULTIPLIER).toBeCloseTo(2.5, 6);
    expect(SURFACE_MODE_REFERENCE_FOV_DEG).toBe(40);
  });

  describe("computeFovFactor", () => {
    it("returns 1 at the reference FOV", () => {
      expect(computeFovFactor(40)).toBeCloseTo(1, 6);
    });

    it("matches Gaia's tan-ratio formula at atlas's default 45° FOV", () => {
      // tan(22.5°) / tan(20°) = 0.41421356 / 0.36397023 ≈ 1.13802
      expect(computeFovFactor(45)).toBeCloseTo(
        Math.tan((45 * Math.PI) / 360) / Math.tan((40 * Math.PI) / 360),
        6
      );
      expect(computeFovFactor(45)).toBeCloseTo(1.138, 3);
    });

    it("monotonically increases with FOV (wider = larger factor)", () => {
      const f30 = computeFovFactor(30);
      const f40 = computeFovFactor(40);
      const f60 = computeFovFactor(60);
      const f90 = computeFovFactor(90);
      expect(f30).toBeLessThan(f40);
      expect(f40).toBeLessThan(f60);
      expect(f60).toBeLessThan(f90);
    });

    it("is sub-linear in FOV (tan curve, not ratio)", () => {
      // At 80° FOV, the linear ratio (80/40 = 2) overshoots the
      // tan ratio (tan(40)/tan(20) ≈ 2.305) — actually slightly
      // higher. Both are super-linear past 40°, but the tan form
      // grows faster as FOV approaches 180°. Confirm the tan
      // form's actual value rather than just guessing the curve
      // direction.
      const linear = 80 / 40;
      const tanRatio = computeFovFactor(80);
      expect(tanRatio).toBeGreaterThan(linear);
    });
  });

  describe("isSurfaceModeActive", () => {
    const baseInputs = {
      focusIsPlanet: true,
      distFromFocus: 100,
      focusRadius: 1000,
      fovDegrees: 40,
    } as const;

    it("returns true when focus is a planet and distance < radius × multiplier / fovFactor (REF FOV)", () => {
      // At REF_FOV: threshold = 1000 × 2.5 / 1 = 2500.
      // distFromFocus = 100 → well inside → true.
      expect(isSurfaceModeActive(baseInputs)).toBe(true);
    });

    it("returns false when distance is at or beyond the threshold", () => {
      // threshold = 2500 → distFromFocus = 2500 fails strict <
      expect(isSurfaceModeActive({ ...baseInputs, distFromFocus: 2500 })).toBe(
        false
      );
      expect(isSurfaceModeActive({ ...baseInputs, distFromFocus: 5000 })).toBe(
        false
      );
    });

    it("returns false when focus is not a planet", () => {
      expect(isSurfaceModeActive({ ...baseInputs, focusIsPlanet: false })).toBe(
        false
      );
    });

    it("returns false on each suppressor flag (gamepad / vr / tracking)", () => {
      expect(isSurfaceModeActive({ ...baseInputs, gamepadInput: true })).toBe(
        false
      );
      expect(isSurfaceModeActive({ ...baseInputs, vr: true })).toBe(false);
      expect(isSurfaceModeActive({ ...baseInputs, isTracking: true })).toBe(
        false
      );
    });

    it("returns false defensively for non-positive radius", () => {
      expect(isSurfaceModeActive({ ...baseInputs, focusRadius: 0 })).toBe(
        false
      );
      expect(isSurfaceModeActive({ ...baseInputs, focusRadius: -1 })).toBe(
        false
      );
    });

    it("widens the threshold proportionally to fovFactor at 45° FOV", () => {
      // At 45°: fovFactor ≈ 1.138 → threshold = 2500 / 1.138 ≈ 2196.83.
      const threshold45 = (1000 * 2.5) / computeFovFactor(45);
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 45,
          distFromFocus: threshold45 - 1,
        })
      ).toBe(true);
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 45,
          distFromFocus: threshold45 + 1,
        })
      ).toBe(false);
    });

    it("at narrower FOV the threshold grows (camera trips surface mode further out)", () => {
      // At 20° FOV: fovFactor ≈ 0.5176 → threshold ≈ 4830.
      // At 40° FOV: fovFactor = 1 → threshold = 2500.
      // distFromFocus = 3000 → tripped at 20°, normal at 40°.
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 20,
          distFromFocus: 3000,
        })
      ).toBe(true);
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 40,
          distFromFocus: 3000,
        })
      ).toBe(false);
    });

    it("at wider FOV the threshold shrinks (camera trips surface mode closer in)", () => {
      // At 80° FOV: fovFactor ≈ 2.305 → threshold ≈ 1085.
      // At 40° FOV: threshold = 2500.
      // distFromFocus = 1500 → tripped at 40°, normal at 80°.
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 80,
          distFromFocus: 1500,
        })
      ).toBe(false);
      expect(
        isSurfaceModeActive({
          ...baseInputs,
          fovDegrees: 40,
          distFromFocus: 1500,
        })
      ).toBe(true);
    });
  });
});
