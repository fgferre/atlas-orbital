import { describe, expect, it } from "vitest";

import { starfieldPointMetrics } from "./starfieldShaderMath";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

// Reference particleSize = sqrt(max(w,h) * DPR) / 60 at roughly a 1440p
// display on DPR 1. Representative of what the shader actually sees.
const REF_PARTICLE_SIZE = 0.75;

describe("starfieldPointMetrics — NASA Eyes exact port", () => {
  const cases: Array<{
    mag: number;
    gl_PointSize: number;
    vBrightness: number;
  }> = [
    // Sirius: brightness ≈ 13.8, sprite clamped at 50.
    { mag: -1.5, gl_PointSize: 41.42, vBrightness: 1 },
    // Vega: brightness ≈ 11, sprite ≈ 33 px, alpha clamped at 1.
    { mag: 0, gl_PointSize: 33.15, vBrightness: 1 },
    // Polaris / mid-range bright stars.
    { mag: 2, gl_PointSize: 22.23, vBrightness: 1 },
    { mag: 3, gl_PointSize: 16.92, vBrightness: 1 },
    { mag: 4, gl_PointSize: 11.91, vBrightness: 1 },
    // Mag 5: sprite shrinks below 10 px, alpha still at ceiling.
    { mag: 5, gl_PointSize: 7.52, vBrightness: 1 },
    // Naked-eye limit (mag ~6–6.5): sprite hits the 5 px floor;
    // alpha still well above the 0.05 floor.
    { mag: 6, gl_PointSize: 5, vBrightness: 1 },
    { mag: 7, gl_PointSize: 5, vBrightness: 0.5 },
    // Binocular depth: sprite at the 5 px floor, alpha falling.
    { mag: 8, gl_PointSize: 5, vBrightness: 0.22 },
    // Telescopic: floor on both size and alpha.
    { mag: 10, gl_PointSize: 5, vBrightness: 0.05 },
    { mag: 12, gl_PointSize: 5, vBrightness: 0.05 },
    { mag: 20, gl_PointSize: 5, vBrightness: 0.05 },
  ];

  it.each(cases)(
    "matches the NASA-exact curve at mag $mag (particleSize $REF_PARTICLE_SIZE)",
    ({ mag, gl_PointSize, vBrightness }) => {
      const result = starfieldPointMetrics(mag, REF_PARTICLE_SIZE);
      approxEq(result.gl_PointSize, gl_PointSize, 0.1);
      approxEq(result.vBrightness, vBrightness, 0.02);
    }
  );

  it("is strictly monotonic: brighter magnitudes produce larger sprites and higher alpha", () => {
    let previousSize = Infinity;
    let previousAlpha = Infinity;
    for (let mag = -2; mag <= 20; mag += 0.25) {
      const { gl_PointSize, vBrightness } = starfieldPointMetrics(
        mag,
        REF_PARTICLE_SIZE
      );
      expect(gl_PointSize).toBeLessThanOrEqual(previousSize + 1e-6);
      expect(vBrightness).toBeLessThanOrEqual(previousAlpha + 1e-6);
      previousSize = gl_PointSize;
      previousAlpha = vBrightness;
    }
  });

  it("floors at 5 px size / 0.05 alpha (NASA's values)", () => {
    const mag15 = starfieldPointMetrics(15, REF_PARTICLE_SIZE);
    expect(mag15.gl_PointSize).toBe(5);
    expect(mag15.vBrightness).toBeCloseTo(0.05);
  });

  it("scales gl_PointSize linearly with particleSize (viewport responsiveness)", () => {
    // Same star, different viewport — sprite grows with particleSize
    // until it hits the 50 px ceiling.
    const ps050 = starfieldPointMetrics(3, 0.5).gl_PointSize;
    const ps075 = starfieldPointMetrics(3, 0.75).gl_PointSize;
    const ps150 = starfieldPointMetrics(3, 1.5).gl_PointSize;
    expect(ps075).toBeGreaterThan(ps050);
    // Mag 3 at particleSize 1.5: brightness·4·1.5 ≈ 33.9 → still under 50.
    expect(ps150).toBeGreaterThan(ps075);
    expect(ps150).toBeLessThanOrEqual(50);
  });
});
