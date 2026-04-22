import { describe, expect, it } from "vitest";
import { cloudBrightness, cloudDayFactor } from "./cloudTerminatorMath";

// Pinned values for T3.6 cloud terminator port.
// Formula is `cloudDayFactor(NL) = 1 - clamp((-NL + 0.25) / (0.12 + 0.25), 0, 1)`
//                                = 1 - clamp((0.25 - NL) / 0.37, 0, 1).
// Derived from Gaia `cloud.fragment.glsl:144` (commit 450c344ca).

describe("cloudDayFactor — Gaia cloud.fragment.glsl:144", () => {
  it("returns 0 at deep night (NL <= -0.25)", () => {
    expect(cloudDayFactor(-0.25)).toBe(0);
    expect(cloudDayFactor(-0.5)).toBe(0);
    expect(cloudDayFactor(-1.0)).toBe(0);
  });

  it("returns 1 when NL >= 0.25 (Gaia full-day edge)", () => {
    // dayFactor = 1 requires linstep(-0.25, 0.12, -NL) = 0, i.e.
    //   -NL <= -0.25 ⇔ NL >= 0.25. Higher threshold than atlas's old
    // symmetric 0.2 — Gaia reserves the shallow-sun zone
    // (0 < NL < 0.25) for the fade-in ramp, so clouds visibly lit up
    // less abruptly into full day.
    expect(cloudDayFactor(0.25)).toBe(1);
    expect(cloudDayFactor(0.5)).toBe(1);
    expect(cloudDayFactor(1.0)).toBe(1);
  });

  it("linear ramp inside [-0.25, 0.12] (asymmetric)", () => {
    // At NL=0: 1 - linstep(-0.25, 0.12, 0) = 1 - (0.25/0.37) ≈ 0.3243
    // So at the geometric terminator the cloud is already > 30% lit —
    // asymmetric dawn reaches full day faster than deep night releases.
    expect(cloudDayFactor(0)).toBeCloseTo(1 - 0.25 / 0.37, 10);
    // At NL=-0.125 (mid-band): 1 - linstep(...)(0.125) = 1 - 0.375/0.37 = clamp
    // Actually 0.375 > 0.37, so linstep = 1, dayFactor = 0
    expect(cloudDayFactor(-0.125)).toBeCloseTo(0, 10);
    // At NL=-0.0625: -NL=0.0625; linstep(-0.25, 0.12, 0.0625)
    //   = (0.0625 - (-0.25))/(0.12 - (-0.25)) = 0.3125/0.37 ≈ 0.8446
    //   dayFactor = 1 - 0.8446 ≈ 0.1554
    expect(cloudDayFactor(-0.0625)).toBeCloseTo(1 - 0.3125 / 0.37, 10);
  });

  it("contrast with atlas's pre-T3.6 smoothstep — Gaia holds clouds at partial-day longer on dawn side", () => {
    // At NL=0.15 (above atlas's old 0.2 midpoint but below Gaia's
    // 0.25 full-day edge), Gaia's dayFactor is:
    //   1 - linstep(-0.25, 0.12, -0.15)
    //   = 1 - linstep(-0.25, 0.12, -0.15)
    //   -0.15 is below edge0=-0.25? No, -0.15 > -0.25, so linstep = (-0.15+0.25)/0.37 = 0.2703
    //   Hmm wait: linstep(a, b, x) = clamp((x-a)/(b-a), 0, 1).
    //   linstep(-0.25, 0.12, -0.15) = (-0.15 - (-0.25))/(0.12-(-0.25)) = 0.10/0.37 ≈ 0.2703.
    //   dayFactor = 1 - 0.2703 = 0.7297.
    // At the same NL=0.15, atlas's old formula:
    //   1 - smoothstep(-0.2, 0.2, 0.15) = 1 - 0.984 ≈ 0.016 (nightFactor)
    //   → day multiplier mix(1.0, 0.05, 0.016) ≈ 0.985 (near full day).
    // So atlas was nearly-fully-lit while Gaia sits at 73% — Gaia
    // holds clouds dimmer through the dawn/dusk band, reducing the
    // over-bright terminator artifact.
    expect(cloudDayFactor(0.15)).toBeCloseTo(1 - 0.1 / 0.37, 10);
  });
});

describe("cloudBrightness — Gaia cloud.fragment.glsl:165", () => {
  it("clamps to 0.03 floor on deep night", () => {
    expect(cloudBrightness(0)).toBe(0.03);
    expect(cloudBrightness(-0.5)).toBe(0.03);
  });

  it("clamps to 1.0 ceiling on full day + ambient", () => {
    expect(cloudBrightness(1.0)).toBe(1.0);
    expect(cloudBrightness(0.95, 0.1)).toBe(1.0);
    expect(cloudBrightness(2.0)).toBe(1.0);
  });

  it("linear in [0.03, 1.0]", () => {
    expect(cloudBrightness(0.5)).toBe(0.5);
    expect(cloudBrightness(0.1, 0.05)).toBeCloseTo(0.15, 10);
    expect(cloudBrightness(0.03)).toBe(0.03);
  });

  it("night floor tightened from atlas's pre-T3.6 0.05 → Gaia 0.03", () => {
    // atlas pre-T3.6 used `mix(1.0, 0.05, cloudNightFactor)` which
    // floored multiplier at 0.05. Gaia's clamp lower bound is 0.03.
    // The 0.02 difference = dimmer clouds on night side = less visible
    // light scatter at the terminator — one of the two fixes that
    // together eliminate the "over-bright terminator" visual bug.
    expect(cloudBrightness(0)).toBe(0.03);
    expect(cloudBrightness(0)).not.toBe(0.05);
  });
});
