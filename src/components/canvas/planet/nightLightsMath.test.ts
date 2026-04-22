import { describe, expect, it } from "vitest";
import { linstep, nightFactor } from "./nightLightsMath";

// Pinned regression values for T3.5 night-lights terminator fix.
// Every break point is derived by hand from Gaia's formula:
//   nightFactor(intensity) = clamp((-intensity - (-0.1)) / (0.1 - (-0.1)), 0, 1)
//                          = clamp((0.1 - intensity) / 0.2, 0, 1)
// See Gaia source `/tmp/gaiasky/assets/shader/lib/pbr.glsl:98-99`.

describe("linstep — Gaia math.glsl:58-61", () => {
  it("returns 0 when x <= edge0", () => {
    expect(linstep(-0.1, 0.1, -0.2)).toBe(0);
    expect(linstep(-0.1, 0.1, -0.1)).toBe(0);
  });

  it("returns 1 when x >= edge1", () => {
    expect(linstep(-0.1, 0.1, 0.1)).toBe(1);
    expect(linstep(-0.1, 0.1, 0.2)).toBe(1);
  });

  it("linearly interpolates between edges (no cubic smoothing)", () => {
    // At mid-point: x = 0 → (0 - (-0.1)) / 0.2 = 0.5
    expect(linstep(-0.1, 0.1, 0)).toBeCloseTo(0.5, 10);
    // 1/4 along: x = -0.05 → (-0.05 + 0.1) / 0.2 = 0.25
    expect(linstep(-0.1, 0.1, -0.05)).toBeCloseTo(0.25, 10);
    // 3/4 along: x = 0.05 → (0.05 + 0.1) / 0.2 = 0.75
    expect(linstep(-0.1, 0.1, 0.05)).toBeCloseTo(0.75, 10);
  });

  it("zero-width interval returns 0 (Gaia `d != 0.0` guard)", () => {
    expect(linstep(0.5, 0.5, 0.5)).toBe(0);
    expect(linstep(0.5, 0.5, 1.0)).toBe(0);
  });
});

describe("nightFactor — Gaia pbr.glsl:98-99", () => {
  it("returns 0 on bright day side (intensity >= 0.1)", () => {
    // This is the whole point of T3.5: atlas's old smoothstep gave
    // ~0.159 at intensity=0.1 (bleed). Gaia gives exactly 0.
    expect(nightFactor(0.1)).toBe(0);
    expect(nightFactor(0.2)).toBe(0);
    expect(nightFactor(1.0)).toBe(0);
  });

  it("returns 1 on deep night side (intensity <= -0.1)", () => {
    expect(nightFactor(-0.1)).toBe(1);
    expect(nightFactor(-0.5)).toBe(1);
    expect(nightFactor(-1.0)).toBe(1);
  });

  it("is exactly 0.5 at the geometric terminator (intensity = 0)", () => {
    // nightFactor(0) = linstep(-0.1, 0.1, 0) = (0 + 0.1) / 0.2 = 0.5
    expect(nightFactor(0)).toBeCloseTo(0.5, 10);
  });

  it("linear ramp through the terminator band [-0.1, 0.1]", () => {
    // At intensity = 0.05 (day-side quarter into band): nightFactor = 0.25
    expect(nightFactor(0.05)).toBeCloseTo(0.25, 10);
    // At intensity = -0.05 (night-side quarter into band): nightFactor = 0.75
    expect(nightFactor(-0.05)).toBeCloseTo(0.75, 10);
  });

  it("regression: atlas's pre-T3.5 smoothstep gave 0.159 at intensity=0.1; Gaia gate is 0", () => {
    // Pinning the specific breakpoint that motivated T3.5.
    // Old atlas formula: 1 - smoothstep(-0.2, 0.2, 0.1) ≈ 0.159 → bleed.
    // New Gaia formula: nightFactor(0.1) = 0 → hard gate at sun 5.7° up.
    expect(nightFactor(0.1)).toBe(0);
  });
});
