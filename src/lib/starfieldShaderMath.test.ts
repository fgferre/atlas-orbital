import { describe, expect, it } from "vitest";

import { smoothstep, starfieldPointMetrics } from "./starfieldShaderMath";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

describe("smoothstep", () => {
  it("returns 0 below the lower edge and 1 above the upper edge", () => {
    expect(smoothstep(1, 2, 0)).toBe(0);
    expect(smoothstep(1, 2, 3)).toBe(1);
  });

  it("hits the 0.5 midpoint at the interval centre", () => {
    approxEq(smoothstep(0, 1, 0.5), 0.5);
  });

  it("matches GLSL Hermite values at a few sample points", () => {
    approxEq(smoothstep(6, 7.5, 6.6), 0.352);
    approxEq(smoothstep(9.5, 12, 10), 0.104);
    approxEq(smoothstep(9.5, 12, 11), 0.648);
  });
});

describe("starfieldPointMetrics — photometric identity (styleMix = 0)", () => {
  it("leaves magnitude uncompressed", () => {
    const { compressedMag } = starfieldPointMetrics(12, 0);
    expect(compressedMag).toBe(12);
  });

  it("keeps sizeBoost and fragment falloff on the original Pogson values", () => {
    const { sizeBoost, falloffPow } = starfieldPointMetrics(7.5, 0);
    expect(sizeBoost).toBe(1);
    expect(falloffPow).toBe(5);
  });

  it("applies no flat alpha bump", () => {
    // A mag-20 star rides the Pogson floor in photometric mode and lands
    // exactly at the 0.08 clamp (no +styleMix * 0.03 extra).
    const { vBrightness } = starfieldPointMetrics(20, 0);
    approxEq(vBrightness, 0.08);
  });

  it("preserves the graduated lift at the naked-eye→binocular band", () => {
    // Mag 7.5 sits at the window peak regardless of styleMix, because the
    // lift uses raw mag. baseSize = sqrtFlux * 2.5 + 1 lift px.
    const { baseSize } = starfieldPointMetrics(7.5, 0);
    approxEq(baseSize, 2.578, 0.01);
  });
});

describe("starfieldPointMetrics — cinematic (styleMix = 1)", () => {
  const cases: Array<{
    mag: number;
    compressedMag: number;
    baseSize: number;
    vBrightness: number;
  }> = [
    { mag: 3, compressedMag: 3, baseSize: 12.53, vBrightness: 0.431 },
    { mag: 6, compressedMag: 6, baseSize: 3.15, vBrightness: 0.131 },
    { mag: 7.5, compressedMag: 6.6, baseSize: 3.388, vBrightness: 0.226 },
    { mag: 9, compressedMag: 7.2, baseSize: 2.81, vBrightness: 0.208 },
    { mag: 11, compressedMag: 8, baseSize: 1.605, vBrightness: 0.113 },
    { mag: 12, compressedMag: 8.4, baseSize: 1.5, vBrightness: 0.08 },
    { mag: 20, compressedMag: 11.6, baseSize: 1.5, vBrightness: 0.08 },
  ];

  it.each(cases)(
    "matches the hand-verified cinematic curve at mag $mag",
    ({ mag, compressedMag, baseSize, vBrightness }) => {
      const result = starfieldPointMetrics(mag, 1);
      approxEq(result.compressedMag, compressedMag, 1e-6);
      approxEq(result.baseSize, baseSize, 0.02);
      approxEq(result.vBrightness, vBrightness, 0.005);
    }
  );

  it("keeps mag 7.5 strictly brighter than mag 12 (Codex Finding 1 regression)", () => {
    // The original bug: running the lift on `compressedMag` instead of
    // raw `mag` let the window's plateau collide with telescopic stars
    // (raw mag ~12 lands at compressed 8.4, inside the peak) while
    // binocular stars (raw mag 7.5 → compressed 6.6) sat on the ramp.
    // That inverted cosmic ordering at a 4-mag gap. Any future refactor
    // that reintroduces the bug fails this assertion fast.
    const near = starfieldPointMetrics(7.5, 1).vBrightness;
    const telescopic = starfieldPointMetrics(12, 1).vBrightness;
    expect(near).toBeGreaterThan(telescopic);
  });

  it("is strictly monotonic outside the lift window (pure Pogson below mag 6, floor above mag 12)", () => {
    // Inside the lift window (6 ≤ mag ≤ 12) the graduated smoothstep
    // intentionally creates a local maximum around mag 7.5 — that is the
    // whole point of the perceptual boost, present in both photometric
    // and cinematic. Outside the window the curve must be monotonic in
    // both modes; this test pins that invariant.
    let previousBelow = Infinity;
    for (let mag = -1; mag < 6; mag += 0.25) {
      const { vBrightness } = starfieldPointMetrics(mag, 1);
      expect(vBrightness).toBeLessThanOrEqual(previousBelow + 1e-6);
      previousBelow = vBrightness;
    }
    const floorValue = starfieldPointMetrics(12, 1).vBrightness;
    for (let mag = 12; mag <= 20; mag += 0.5) {
      const { vBrightness } = starfieldPointMetrics(mag, 1);
      expect(vBrightness).toBeCloseTo(floorValue, 5);
    }
  });

  it("documents the intentional lift hump: mag 7.5 > mag 6", () => {
    // Lift boosts faint-to-mid stars above what raw Pogson would give
    // them. This produces a local maximum at mag 7.5 that sits higher
    // than mag 6 in both modes — the visible "density" the user
    // perceives. If this ever reverses, the lift has been gutted.
    const atWindowOpen = starfieldPointMetrics(6, 1).vBrightness;
    const atWindowPeak = starfieldPointMetrics(7.5, 1).vBrightness;
    expect(atWindowPeak).toBeGreaterThan(atWindowOpen);
  });

  it("boosts sprite size and sharpens the fragment falloff", () => {
    const result = starfieldPointMetrics(7.5, 1);
    expect(result.sizeBoost).toBeCloseTo(1.8);
    expect(result.falloffPow).toBeCloseTo(9);
  });
});

describe("starfieldPointMetrics — intermediate styleMix", () => {
  it("linearly interpolates sizeBoost and falloffPow at 0.5", () => {
    const { sizeBoost, falloffPow } = starfieldPointMetrics(7.5, 0.5);
    expect(sizeBoost).toBeCloseTo(1.4);
    expect(falloffPow).toBeCloseTo(7);
  });

  it("leaves the bright end (mag < 6) invariant under compression", () => {
    const photometric = starfieldPointMetrics(3, 0);
    const cinematic = starfieldPointMetrics(3, 1);
    // compressedMag equals raw mag in both cases, so sqrtFlux and baseSize
    // only differ via the flat alpha bump and the sprite/falloff effects
    // that live outside baseSize.
    expect(cinematic.compressedMag).toBe(photometric.compressedMag);
    approxEq(cinematic.baseSize, photometric.baseSize, 1e-6);
  });
});
