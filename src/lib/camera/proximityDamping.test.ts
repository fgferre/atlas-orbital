import { describe, expect, it } from "vitest";

import {
  computeProximityDamping,
  PROXIMITY_DAMPING_BASE,
  PROXIMITY_DAMPING_MAX,
} from "./proximityDamping";

describe("proximityDamping", () => {
  it("pins the base damping at the pre-T4.2-α OrbitControls default", () => {
    expect(PROXIMITY_DAMPING_BASE).toBeCloseTo(0.05, 6);
  });

  it("pins the max damping at 0.5 (empirical surface-stop ceiling)", () => {
    expect(PROXIMITY_DAMPING_MAX).toBeCloseTo(0.5, 6);
  });

  it("returns base damping when no focus is active (elevation <= 0)", () => {
    expect(computeProximityDamping(10, 0)).toBe(PROXIMITY_DAMPING_BASE);
    expect(computeProximityDamping(10, -1)).toBe(PROXIMITY_DAMPING_BASE);
  });

  it("returns max damping when camera sits at-or-below surface", () => {
    expect(computeProximityDamping(5, 5)).toBe(PROXIMITY_DAMPING_MAX);
    expect(computeProximityDamping(3, 5)).toBe(PROXIMITY_DAMPING_MAX);
  });

  it("hits the halfway point at one body-radius above surface", () => {
    // cameraDistance = 2 × elevation → proximityRatio = 1 → closeness = 0.5
    // damping = base + (max - base) × 0.5 = 0.05 + 0.45 × 0.5 = 0.275
    expect(computeProximityDamping(20, 10)).toBeCloseTo(0.275, 6);
    expect(computeProximityDamping(2, 1)).toBeCloseTo(0.275, 6);
  });

  it("asymptotes toward base damping at stellar distances", () => {
    // r >> 1 → proximityRatio → 0 → closeness → 0 → damping → base
    const farDamping = computeProximityDamping(1_000_000, 1);
    expect(farDamping).toBeGreaterThan(PROXIMITY_DAMPING_BASE);
    expect(farDamping).toBeLessThan(PROXIMITY_DAMPING_BASE + 0.001);
  });

  it("monotonically increases as the camera approaches the body", () => {
    const elevation = 100;
    const damping10x = computeProximityDamping(10 * elevation, elevation);
    const damping5x = computeProximityDamping(5 * elevation, elevation);
    const damping2x = computeProximityDamping(2 * elevation, elevation);
    const damping1_5x = computeProximityDamping(1.5 * elevation, elevation);
    const damping1_1x = computeProximityDamping(1.1 * elevation, elevation);

    expect(damping10x).toBeLessThan(damping5x);
    expect(damping5x).toBeLessThan(damping2x);
    expect(damping2x).toBeLessThan(damping1_5x);
    expect(damping1_5x).toBeLessThan(damping1_1x);
    expect(damping1_1x).toBeLessThan(PROXIMITY_DAMPING_MAX);
  });

  it("honors Gaia's proximityRatio formula (1 / ((dist - elev) / elev))", () => {
    // At dist = 3 × elev: proximityRatio = 1/2 → closeness = 1/3
    // damping = 0.05 + 0.45 × (1/3) = 0.20
    expect(computeProximityDamping(30, 10)).toBeCloseTo(0.2, 6);
    // At dist = 11 × elev: proximityRatio = 1/10 → closeness = 1/11
    // damping = 0.05 + 0.45 / 11 ≈ 0.09091
    expect(computeProximityDamping(11, 1)).toBeCloseTo(
      PROXIMITY_DAMPING_BASE +
        (PROXIMITY_DAMPING_MAX - PROXIMITY_DAMPING_BASE) / 11,
      6
    );
  });

  it("scale-invariant in (cameraDistance, elevation) — only their ratio matters", () => {
    expect(computeProximityDamping(20, 10)).toBeCloseTo(
      computeProximityDamping(20_000, 10_000),
      6
    );
    expect(computeProximityDamping(20, 10)).toBeCloseTo(
      computeProximityDamping(0.002, 0.001),
      6
    );
  });
});
