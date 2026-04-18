import { describe, expect, it } from "vitest";

import { starfieldPointMetrics } from "./starfieldShaderMath";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

describe("starfieldPointMetrics — NASA Eyes–calibrated log curve", () => {
  const cases: Array<{
    mag: number;
    baseSize: number;
    vBrightness: number;
  }> = [
    // Sirius-bright: brightness exceeds the alpha ceiling, size clamps.
    { mag: -1.5, baseSize: 12, vBrightness: 1 },
    // Vega: brightness ≈ 11, size clamped at 12, alpha 0.88.
    { mag: 0, baseSize: 12, vBrightness: 0.884 },
    // Polaris-ish / Orion's belt: mid-curve.
    { mag: 2, baseSize: 11.1, vBrightness: 0.592 },
    { mag: 3, baseSize: 8.46, vBrightness: 0.451 },
    { mag: 4, baseSize: 5.94, vBrightness: 0.317 },
    // Naked-eye-limit region: sprite shrinks fast, alpha still above floor.
    { mag: 5, baseSize: 3.76, vBrightness: 0.2 },
    // Past naked-eye limit: sizes/alphas start hitting the floors.
    { mag: 6.5, baseSize: 2, vBrightness: 0.12 },
    { mag: 8, baseSize: 2, vBrightness: 0.12 },
    // Deep survey tail: floors.
    { mag: 12, baseSize: 2, vBrightness: 0.12 },
    { mag: 20, baseSize: 2, vBrightness: 0.12 },
  ];

  it.each(cases)(
    "matches the hand-verified NASA-calibrated curve at mag $mag",
    ({ mag, baseSize, vBrightness }) => {
      const result = starfieldPointMetrics(mag);
      approxEq(result.baseSize, baseSize, 0.02);
      approxEq(result.vBrightness, vBrightness, 0.005);
    }
  );

  it("is strictly monotonic: brighter magnitudes produce larger sprites and higher alpha", () => {
    // log(1 + flux·C) is strictly increasing in flux; apparent-mag flux is
    // strictly decreasing in magnitude; so size and alpha are strictly
    // non-increasing over the magnitude axis. Inside the clamps the
    // relationship is strict; outside (floor / ceiling regions) it is
    // equal, never reversed.
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

  it("floors at 2 px / 0.12 alpha for faint stars — crystalline points, not haze", () => {
    // The floors are small enough to read as sharp points (crystalline
    // look the user asked for) but still multi-fragment on retina
    // displays where the final physical size = 2 × devicePixelRatio × viewportScale.
    const mag15 = starfieldPointMetrics(15);
    expect(mag15.baseSize).toBe(2);
    expect(mag15.vBrightness).toBeCloseTo(0.12);
  });

  it("caps the bright end at 12 px / 1.0 alpha", () => {
    // Sirius (mag ≈ -1.46) is the brightest star in the sky and should
    // hit the ceiling clamps exactly — we do not want Sirius rendering
    // as a 40 px disc the way the previous calibration did.
    const sirius = starfieldPointMetrics(-1.46);
    expect(sirius.baseSize).toBe(12);
    expect(sirius.vBrightness).toBe(1);
  });
});
