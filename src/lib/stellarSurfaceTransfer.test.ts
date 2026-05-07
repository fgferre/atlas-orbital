import { describe, expect, it } from "vitest";

import {
  applyClassColorTransfer,
  applyTransferWithPlanB,
  blackbodyLinearCurve,
  classRelativeBias,
  DEFAULT_CLASS_BIAS_CEILING,
  DEFAULT_CLASS_BIAS_FLOOR,
  DEFAULT_CLASS_BIAS_GAMMA,
  legacyCurve,
  PLAN_B_TEFF_RAMP_K,
  PLAN_B_TEFF_THRESHOLD_K,
  planBWeight,
  SOLAR_CLASS_COLOR,
} from "./stellarSurfaceTransfer";

/**
 * T6.4-M4 fix tests. The non-negotiable contract:
 *
 *   1. Sun byte-identical pre-M4 at any `b`, `tintBase`, `brightness`
 *      when classColor = SOLAR_CLASS_COLOR. (Construction-guaranteed
 *      because ratio=1 → bias=1 regardless of gamma.)
 *
 *   2. Sphere and glow share `classRelativeBias` (same spectral
 *      identity) but use different `tintBase` (0.2 sphere, 0.4 glow).
 *
 *   3. Numerical thresholds for Sirius/Betelgeuse/Proxima are
 *      placeholders — real calibration awaits empirical b-distribution
 *      measurement via debug shader. These pin the math correctness
 *      and rough class direction (Sirius bluer than Sun, Betelgeuse
 *      redder, etc.), NOT perceptual aesthetics.
 */

const TYPICAL_BRIGHTNESS = 0.6;
const SUN_TINT_BASE = 0.2; // pre-M4 surface uTint
const GLOW_TINT_BASE = 0.4; // pre-M4 glow uTint

// Verified named-star linear-RGB values from blackbodyRgbFromTemperature.
// Pinned in stellarColor.test.ts at TOL=0.02; reproduced here for
// pin-test isolation (this module's tests don't depend on stellarColor's
// helper directly — they take classColor as input).
const SIRIUS_CLASS_COLOR = [0.592, 0.703, 1.0] as const;
const BETELGEUSE_CLASS_COLOR = [1.0, 0.53, 0.266] as const;
const PROXIMA_CLASS_COLOR = [1.0, 0.45, 0.166] as const;

describe("legacyCurve — pre-M4 atlas signature shape", () => {
  it("Sun surface at b=1 returns pre-M4 byte-identical (0.6, 0.12, 0.0048)", () => {
    const [r, g, b] = legacyCurve(1, SUN_TINT_BASE, TYPICAL_BRIGHTNESS);
    expect(r).toBeCloseTo(0.6, 6);
    expect(g).toBeCloseTo(0.12, 6);
    expect(b).toBeCloseTo(0.0048, 6);
  });

  it("Sun surface at b=2 returns pre-M4 (1.2, 0.48, 0.0768)", () => {
    const [r, g, b] = legacyCurve(2, SUN_TINT_BASE, TYPICAL_BRIGHTNESS);
    expect(r).toBeCloseTo(1.2, 6);
    expect(g).toBeCloseTo(0.48, 6);
    expect(b).toBeCloseTo(0.0768, 6);
  });

  it("Sun surface at b=4 returns pre-M4 (2.4, 1.92, 1.2288)", () => {
    const [r, g, b] = legacyCurve(4, SUN_TINT_BASE, TYPICAL_BRIGHTNESS);
    expect(r).toBeCloseTo(2.4, 6);
    expect(g).toBeCloseTo(1.92, 6);
    expect(b).toBeCloseTo(1.2288, 6);
  });

  it("Sun surface at b=5 collapses to white (3, 3, 3) — pre-M4 self-saturation point", () => {
    // Curiously elegant property of the pre-M4 curve: at b=5 with
    // tintBase=0.2 brightness=0.6, all three channels equal 3 exactly.
    //   R = 5 × 0.6                = 3
    //   G = 25 × 0.04 × 0.6 × ?    wait: G = b² × tint × bright = 25 × 0.2 × 0.6 = 3
    //   B = 625 × 0.008 × 0.6      = 3
    // The b⁴ blue catches up to b² green catches up to b red exactly
    // at b=5. This is the pre-M4 "natural white-out" point.
    const [r, g, b] = legacyCurve(5, SUN_TINT_BASE, TYPICAL_BRIGHTNESS);
    expect(r).toBeCloseTo(3.0, 6);
    expect(g).toBeCloseTo(3.0, 6);
    expect(b).toBeCloseTo(3.0, 6);
  });

  it("glow tintBase=0.4 produces different curve from sphere tintBase=0.2 at same b", () => {
    const sphere = legacyCurve(2, 0.2, 0.6);
    const glow = legacyCurve(2, 0.4, 0.6);
    // R unchanged (no tint in red channel).
    expect(sphere[0]).toBeCloseTo(glow[0], 6);
    // G grows with tintBase: 0.4 / 0.2 = 2× brighter green.
    expect(glow[1] / sphere[1]).toBeCloseTo(2.0, 6);
    // B grows with tintBase³: (0.4/0.2)³ = 8× brighter blue.
    expect(glow[2] / sphere[2]).toBeCloseTo(8.0, 6);
  });
});

describe("classRelativeBias — Sun preserved by construction", () => {
  it("classColor === SOLAR_CLASS_COLOR returns (1, 1, 1) at any gamma", () => {
    for (const gamma of [0.5, 1, 2, 3, 7]) {
      const bias = classRelativeBias(
        SOLAR_CLASS_COLOR,
        gamma,
        DEFAULT_CLASS_BIAS_FLOOR,
        DEFAULT_CLASS_BIAS_CEILING
      );
      expect(bias[0]).toBeCloseTo(1.0, 9);
      expect(bias[1]).toBeCloseTo(1.0, 9);
      expect(bias[2]).toBeCloseTo(1.0, 9);
    }
  });

  it("non-finite or zero ratio falls back to floor (defensive)", () => {
    const bias = classRelativeBias([NaN, 0, -1], 1, 0.12, 3.0);
    expect(bias[0]).toBe(0.12);
    expect(bias[1]).toBe(0.12);
    expect(bias[2]).toBe(0.12);
  });

  it("Sirius bias direction: blue ratio > 1 (boost), red ratio < 1 (attenuate)", () => {
    const bias = classRelativeBias(SIRIUS_CLASS_COLOR);
    expect(bias[0]).toBeLessThan(1); // R attenuated
    expect(bias[2]).toBeGreaterThan(1); // B boosted
  });

  it("Betelgeuse bias direction: red ratio = 1 (preserved), blue ratio < 1 (attenuate)", () => {
    const bias = classRelativeBias(BETELGEUSE_CLASS_COLOR);
    expect(bias[0]).toBeCloseTo(1, 6); // R preserved (1.0/1.0)
    expect(bias[1]).toBeLessThan(1); // G attenuated
    expect(bias[2]).toBeLessThan(1); // B attenuated
  });

  it("ceiling clamps explosive ratios at gamma > 1", () => {
    // Hypothetical ultra-blue classColor (more blue than Sirius) with
    // high gamma should clamp at ceiling, not blow up.
    const ultraBlue = [0.3, 0.5, 1.0] as const;
    const bias = classRelativeBias(ultraBlue, 5, 0.12, 3.0);
    expect(bias[2]).toBeLessThanOrEqual(3.0);
  });

  it("floor clamps small ratios at low gamma > 0", () => {
    // Cool brown dwarf-like classColor with very low blue: bias.b
    // should clamp at floor, not collapse to zero.
    const brownDwarf = [1.0, 0.2, 0.05] as const;
    const bias = classRelativeBias(brownDwarf, 1, 0.12, 3.0);
    expect(bias[2]).toBeGreaterThanOrEqual(0.12);
  });
});

describe("applyClassColorTransfer — Sun byte-identical contract", () => {
  it("Sun classColor + sphere tintBase → matches legacyCurve exactly at every b", () => {
    for (const b of [0.5, 1, 2, 3, 4, 5]) {
      const transferred = applyClassColorTransfer(
        b,
        SUN_TINT_BASE,
        TYPICAL_BRIGHTNESS,
        SOLAR_CLASS_COLOR
      );
      const legacy = legacyCurve(b, SUN_TINT_BASE, TYPICAL_BRIGHTNESS);
      expect(transferred[0]).toBeCloseTo(legacy[0], 9);
      expect(transferred[1]).toBeCloseTo(legacy[1], 9);
      expect(transferred[2]).toBeCloseTo(legacy[2], 9);
    }
  });

  it("Sun classColor + glow tintBase → matches glow legacyCurve exactly", () => {
    for (const b of [0.5, 1, 2, 3, 4]) {
      const transferred = applyClassColorTransfer(
        b,
        GLOW_TINT_BASE,
        1.06, // pre-M4 glow brightness
        SOLAR_CLASS_COLOR
      );
      const legacy = legacyCurve(b, GLOW_TINT_BASE, 1.06);
      expect(transferred[0]).toBeCloseTo(legacy[0], 9);
      expect(transferred[1]).toBeCloseTo(legacy[1], 9);
      expect(transferred[2]).toBeCloseTo(legacy[2], 9);
    }
  });
});

describe("applyClassColorTransfer — Sirius (rough class direction)", () => {
  // Calibration NOTE: with default gamma=1 floor=0.12 ceiling=3.0,
  // Sirius b=2 still reads R-dominant because the legacy curve's
  // b⁴ × 0.0048 damping is so aggressive in blue that ratio 1.256
  // can't pull blue out at low b. Plan A intentionally ships with
  // mild class differentiation to preserve Sun byte-identical;
  // stronger blue identity for hot stars is Plan B's job (deferred
  // until smoke decides).
  //
  // These tests pin DIRECTION (Sirius bluer than Sun), not magnitude.

  it("Sirius output has more blue (relatively) than the Sun's output at the same b", () => {
    for (const b of [1, 2, 3, 4]) {
      const sun = applyClassColorTransfer(
        b,
        SUN_TINT_BASE,
        TYPICAL_BRIGHTNESS,
        SOLAR_CLASS_COLOR
      );
      const sirius = applyClassColorTransfer(
        b,
        SUN_TINT_BASE,
        TYPICAL_BRIGHTNESS,
        SIRIUS_CLASS_COLOR
      );
      // Blue/red ratio strictly higher for Sirius.
      const sunBR = sun[2] / sun[0];
      const siriusBR = sirius[2] / sirius[0];
      expect(siriusBR).toBeGreaterThan(sunBR);
    }
  });

  it("Sirius shows blue dominance at high b (pre-M4 white-out point)", () => {
    // At b=5 the pre-M4 curve self-saturates to (3, 3, 3). Sirius
    // bias multiplies: (3 × 0.592, 3 × 0.789, 3 × 1.256) =
    // (1.776, 2.367, 3.768). B is dominant.
    const [r, g, b] = applyClassColorTransfer(
      5,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      SIRIUS_CLASS_COLOR
    );
    expect(b).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(r);
  });
});

describe("applyClassColorTransfer — Betelgeuse / Proxima (red dominance)", () => {
  it("Betelgeuse stays red-dominant across typical b", () => {
    for (const b of [1, 2, 3, 4]) {
      const [r, g, blueCh] = applyClassColorTransfer(
        b,
        SUN_TINT_BASE,
        TYPICAL_BRIGHTNESS,
        BETELGEUSE_CLASS_COLOR
      );
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(blueCh);
    }
  });

  it("Proxima keeps green/blue detectable (above floor) — no monochromatic flatten", () => {
    // With floor=0.12, even Proxima (very low blue) keeps non-zero
    // green and blue in the rendered output.
    const [, g, blueCh] = applyClassColorTransfer(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      PROXIMA_CLASS_COLOR
    );
    expect(g).toBeGreaterThan(0);
    expect(blueCh).toBeGreaterThan(0);
  });

  it("Betelgeuse and Proxima are distinguishable at the same b (different chromaticity)", () => {
    const betelgeuse = applyClassColorTransfer(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      BETELGEUSE_CLASS_COLOR
    );
    const proxima = applyClassColorTransfer(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      PROXIMA_CLASS_COLOR
    );
    // Different RGB triples (not byte-identical).
    expect(
      betelgeuse[0] !== proxima[0] ||
        betelgeuse[1] !== proxima[1] ||
        betelgeuse[2] !== proxima[2]
    ).toBe(true);
  });
});

// T6.4-M5 Plan B (activated 2026-05-07): hot stars only.

describe("planBWeight — temperature-gated activation", () => {
  it("Sun (5778 K) → 0 (below activation threshold)", () => {
    expect(planBWeight(5778)).toBe(0);
  });

  it("Cool stars (Betelgeuse 3500 K, Proxima 3050 K) → 0", () => {
    expect(planBWeight(3500)).toBe(0);
    expect(planBWeight(3050)).toBe(0);
  });

  it("Exactly at threshold (7500 K) → 0", () => {
    expect(planBWeight(7500)).toBe(0);
  });

  it("Just above threshold (7501 K) → tiny positive weight", () => {
    expect(planBWeight(7501)).toBeGreaterThan(0);
    expect(planBWeight(7501)).toBeLessThan(0.001);
  });

  it("Sirius (9940 K) → ~0.976 (8/2.5 of ramp)", () => {
    // (9940 - 7500) / 2500 = 0.976
    expect(planBWeight(9940)).toBeCloseTo(0.976, 3);
  });

  it("Vega (9602 K) → ~0.841", () => {
    expect(planBWeight(9602)).toBeCloseTo(0.841, 3);
  });

  it("Hot O-type (>=10000 K) → clamped at 1.0", () => {
    expect(planBWeight(10000)).toBe(1.0);
    expect(planBWeight(30000)).toBe(1.0);
  });

  it("Non-finite input → 0 (defensive)", () => {
    expect(planBWeight(NaN)).toBe(0);
    expect(planBWeight(Infinity)).toBe(0);
  });
});

describe("blackbodyLinearCurve — pure linear chromaticity", () => {
  it("Sirius classColor at b=2 → blue dominant by construction", () => {
    const [r, g, b] = blackbodyLinearCurve(
      2,
      SIRIUS_CLASS_COLOR,
      TYPICAL_BRIGHTNESS
    );
    // (0.592, 0.703, 1.0) × 2 × 0.6 = (0.71, 0.844, 1.2)
    expect(r).toBeCloseTo(0.71, 2);
    expect(g).toBeCloseTo(0.844, 2);
    expect(b).toBeCloseTo(1.2, 2);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });
});

describe("applyTransferWithPlanB — blend behaviour", () => {
  it("Sun (tEff=5778) returns pure Plan A (weight=0)", () => {
    const planA = applyClassColorTransfer(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      SOLAR_CLASS_COLOR
    );
    const blended = applyTransferWithPlanB(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      SOLAR_CLASS_COLOR,
      5778
    );
    expect(blended).toEqual(planA);
  });

  it("Sirius (tEff=9940) blends mostly toward Plan B → blue dominant at b=2", () => {
    const [r, g, b] = applyTransferWithPlanB(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      SIRIUS_CLASS_COLOR,
      9940
    );
    // Plan B at b=2 = (0.71, 0.844, 1.2). Plan A is red-dominant.
    // weight=0.976 → mostly Plan B → blue dominant.
    expect(b).toBeGreaterThan(g);
    expect(b).toBeGreaterThan(r);
  });

  it("Cool supergiants (Betelgeuse tEff=3520) preserve Plan A red stylization", () => {
    const planA = applyClassColorTransfer(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      BETELGEUSE_CLASS_COLOR
    );
    const blended = applyTransferWithPlanB(
      2,
      SUN_TINT_BASE,
      TYPICAL_BRIGHTNESS,
      BETELGEUSE_CLASS_COLOR,
      3520
    );
    // tEff far below threshold → weight=0 → identical to Plan A.
    expect(blended).toEqual(planA);
  });
});

describe("Plan B threshold constants", () => {
  it("PLAN_B_TEFF_THRESHOLD_K = 7500 (between G and A class anchors)", () => {
    expect(PLAN_B_TEFF_THRESHOLD_K).toBe(7500);
  });

  it("PLAN_B_TEFF_RAMP_K = 2500 (full activation by ~10000 K)", () => {
    expect(PLAN_B_TEFF_RAMP_K).toBe(2500);
  });
});

describe("Default knob values (atlas-opinion baseline)", () => {
  it("DEFAULT_CLASS_BIAS_GAMMA = 1 (most conservative — preserves HDR safety)", () => {
    expect(DEFAULT_CLASS_BIAS_GAMMA).toBe(1.0);
  });

  it("DEFAULT_CLASS_BIAS_FLOOR = 0.12 (prevents zero-channel collapse for cool stars)", () => {
    expect(DEFAULT_CLASS_BIAS_FLOOR).toBe(0.12);
  });

  it("DEFAULT_CLASS_BIAS_CEILING = 3.0 (prevents laser-blue for hot stars)", () => {
    expect(DEFAULT_CLASS_BIAS_CEILING).toBe(3.0);
  });

  it("SOLAR_CLASS_COLOR matches SUN_DEFAULT_VISUAL_PROFILE blackbody at 5778 K", () => {
    expect(SOLAR_CLASS_COLOR[0]).toBe(1.0);
    expect(SOLAR_CLASS_COLOR[1]).toBe(0.891);
    expect(SOLAR_CLASS_COLOR[2]).toBe(0.796);
  });
});
