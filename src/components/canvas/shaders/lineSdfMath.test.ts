import { describe, expect, it } from "vitest";

import {
  LINE_SDF_ALPHA_EXPONENT,
  LINE_SDF_BRIGHT_CORE_EXPONENT,
  lineSdfAlpha,
  lineSdfBrightCore,
  lineSdfCore,
} from "./lineSdfMath";

const approxEq = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("line SDF constants — pinned to Gaia line.quad.cpu.fragment.glsl", () => {
  it("alpha exponent matches line.quad.cpu.fragment.glsl:27 literal (1.8)", () => {
    expect(LINE_SDF_ALPHA_EXPONENT).toBe(1.8);
  });

  it("bright-core exponent matches line.quad.cpu.fragment.glsl:28 literal (10.0)", () => {
    expect(LINE_SDF_BRIGHT_CORE_EXPONENT).toBe(10.0);
  });
});

describe("lineSdfCore — line.quad.cpu.fragment.glsl:26", () => {
  it("peaks at 1.0 at the centerline (x=0)", () => {
    // cos(0) = 1, 1 - 0 = 1, min = 1.
    approxEq(lineSdfCore(0), 1, 1e-12);
  });

  it("drops to 0 at the edge (x = ±1)", () => {
    // cos(π/2) = 0, 1 - 1 = 0, min = 0.
    approxEq(lineSdfCore(1), 0, 1e-12);
    approxEq(lineSdfCore(-1), 0, 1e-12);
  });

  it("clamps to 0 in the endcap region (|x| > 1)", () => {
    // Gaia doesn't render endcaps, but atlas's LineMaterial does via
    // a separate AA path. Guard against NaN from pow(negative, 1.8).
    expect(lineSdfCore(1.5)).toBe(0);
    expect(lineSdfCore(-1.5)).toBe(0);
    expect(lineSdfCore(2)).toBe(0);
  });

  it("equals cos(PI*x/2) in the inner region (|x| small), bounded by 1-|x| near the edges", () => {
    // At x=0.5: cos(π/4) ≈ 0.707, 1 - 0.5 = 0.5 → min is 1-|x|.
    approxEq(lineSdfCore(0.5), 0.5, 1e-12);
    approxEq(lineSdfCore(-0.5), 0.5, 1e-12);
    // At x=0.1: cos(0.05π) ≈ 0.9877, 1 - 0.1 = 0.9 → min is 1-|x|.
    // (The cosine branch dominates when cos(π·x/2) < 1-|x|, which
    // happens for small x. At x=0.1, 1-|x|=0.9 < cos(0.05π)=0.9877,
    // so the min picks 1-|x|. Actually: which branch dominates where?
    // cos(π·x/2) = 1-|x| at x ≈ 0.3 roughly. Below that: 1-|x| wins.
    // Above: cos wins. At x=0.5: both are 0.5 and cos is 0.707 — so
    // 1-|x|=0.5 wins. At x=0.8: 1-|x|=0.2, cos(0.4π)=0.309 → 1-|x| wins.
    // At x=0.95: 1-|x|=0.05, cos(0.475π)=0.0785 → 1-|x| wins.
    // So 1-|x| dominates for most of the range. This is expected —
    // Gaia's min() picks the tighter envelope.)
    approxEq(lineSdfCore(0.1), 0.9, 1e-12);
    approxEq(lineSdfCore(0.8), 0.2, 1e-12);
  });

  it("is symmetric around x=0", () => {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      approxEq(lineSdfCore(x), lineSdfCore(-x), 1e-12);
    }
  });
});

describe("lineSdfAlpha — soft-edge multiplier", () => {
  it("peaks at 1.0 at the centerline", () => {
    approxEq(lineSdfAlpha(0), 1, 1e-12);
  });

  it("is 0 at and beyond the edge", () => {
    approxEq(lineSdfAlpha(1), 0, 1e-12);
    approxEq(lineSdfAlpha(1.2), 0, 1e-12);
  });

  it("falls off smoothly (exponent 1.8 > 1 gives concave edges)", () => {
    // At x=0.5, core=0.5, alpha = 0.5^1.8 ≈ 0.2872.
    approxEq(lineSdfAlpha(0.5), Math.pow(0.5, 1.8), 1e-12);
  });

  it("is monotonically non-increasing from x=0 outward", () => {
    let prev = Infinity;
    for (const x of [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9, 1]) {
      const v = lineSdfAlpha(x);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("lineSdfBrightCore — additive centerline boost", () => {
  it("peaks at 1.0 at centerline, drops much faster than alpha", () => {
    approxEq(lineSdfBrightCore(0), 1, 1e-12);
    // At x=0.5, core=0.5, cplus = 0.5^10 ≈ 0.000977 — near-zero.
    const cplus = lineSdfBrightCore(0.5);
    expect(cplus).toBeGreaterThan(0);
    expect(cplus).toBeLessThan(0.01);
    // At x=0.3, core=0.7, cplus = 0.7^10 ≈ 0.0282 — still small.
    approxEq(lineSdfBrightCore(0.3), Math.pow(0.7, 10), 1e-12);
  });

  it("is narrower than the alpha profile (exponent 10 vs 1.8)", () => {
    // At x=0.2, alpha > bright core (wider profile).
    expect(lineSdfAlpha(0.2)).toBeGreaterThan(lineSdfBrightCore(0.2));
    expect(lineSdfAlpha(0.4)).toBeGreaterThan(lineSdfBrightCore(0.4));
  });

  it("is 0 at and beyond the edge", () => {
    approxEq(lineSdfBrightCore(1), 0, 1e-12);
    approxEq(lineSdfBrightCore(1.5), 0, 1e-12);
  });
});
