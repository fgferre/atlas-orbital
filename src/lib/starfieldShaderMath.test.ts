import { describe, expect, it } from "vitest";

import { starfieldPointMetrics } from "./starfieldShaderMath";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

describe("starfieldPointMetrics — NASA-style log-compressed curve", () => {
  const cases: Array<{
    mag: number;
    baseSize: number;
    vBrightness: number;
  }> = [
    // Sirius-bright: clamped at the 40 px ceiling.
    { mag: -1.5, baseSize: 40, vBrightness: 1 },
    // Vega-bright: still at the ceiling because log(1 + 5000·1) ≈ 17.
    { mag: 0, baseSize: 40, vBrightness: 1 },
    // Ursa Major / Orion bright stars: mid-range of the curve.
    { mag: 3, baseSize: 34.54, vBrightness: 0.921 },
    // Sun-like naked-eye: comfortably within the alpha ceiling.
    { mag: 5, baseSize: 23.59, vBrightness: 0.629 },
    // Naked-eye limit in realistic mode.
    { mag: 6.5, baseSize: 15.63, vBrightness: 0.417 },
    // Binocular: still well above the floor.
    { mag: 8, baseSize: 8.55, vBrightness: 0.228 },
    // Approaching the floor: size clamps, alpha clamps.
    { mag: 10, baseSize: 4, vBrightness: 0.12 },
    // Deep tail: floor.
    { mag: 12, baseSize: 4, vBrightness: 0.12 },
    { mag: 20, baseSize: 4, vBrightness: 0.12 },
  ];

  it.each(cases)(
    "matches the hand-verified NASA-style curve at mag $mag",
    ({ mag, baseSize, vBrightness }) => {
      const result = starfieldPointMetrics(mag);
      approxEq(result.baseSize, baseSize, 0.02);
      approxEq(result.vBrightness, vBrightness, 0.005);
    }
  );

  it("is strictly monotonic: brighter magnitudes produce larger sprites and higher alpha", () => {
    // Unlike the previous two-stage curve this one has no perceptual
    // hump — log(1 + flux·C) is strictly increasing in flux, so
    // reversing the magnitude axis gives a strictly decreasing size.
    // Outside the clamps we get equality (ceiling/floor); inside, the
    // curve is strictly monotonic.
    let previousSize = Infinity;
    let previousAlpha = Infinity;
    for (let mag = -2; mag <= 20; mag += 0.25) {
      const { baseSize, vBrightness } = starfieldPointMetrics(mag);
      expect(baseSize).toBeLessThanOrEqual(previousSize + 1e-6);
      expect(vBrightness).toBeLessThanOrEqual(previousAlpha + 1e-6);
      previousSize = baseSize;
      previousAlpha = vBrightness;
    }
  });

  it("has a 4 px size floor and 0.12 alpha floor so faint stars stay visible", () => {
    // These floors are the density lever — NASA Eyes uses similar
    // minimums so survey-depth stars (mag 10+) remain perceptible
    // multi-fragment sprites rather than sub-pixel ghosts.
    const mag15 = starfieldPointMetrics(15);
    expect(mag15.baseSize).toBe(4);
    expect(mag15.vBrightness).toBeCloseTo(0.12);
  });

  it("clamps the bright end at 40 px size / 1.0 alpha", () => {
    const sirius = starfieldPointMetrics(-1.46);
    expect(sirius.baseSize).toBe(40);
    expect(sirius.vBrightness).toBe(1);
  });
});
