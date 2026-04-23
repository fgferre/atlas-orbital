import { describe, expect, it } from "vitest";

import {
  MSDF_MIN_OPACITY_DISCARD,
  MSDF_SDF_THRESHOLD,
  MSDF_SMOOTHING_DIVISOR,
  msdfAlpha,
  msdfPremultiply,
  msdfShouldDiscardAlpha,
  msdfShouldDiscardOpacity,
  msdfSmoothing,
  msdfSmoothstep,
} from "./msdfFontMath";

// Source: /tmp/gaiasky/assets/shader/font.fragment.glsl (MPL-2.0).

describe("msdfFontMath — constants match font.fragment.glsl literals", () => {
  it("MSDF_SMOOTHING_DIVISOR = 16.0 (line 26: `1.0 / (16.0 * u_scale)`)", () => {
    expect(MSDF_SMOOTHING_DIVISOR).toBe(16.0);
  });

  it("MSDF_SDF_THRESHOLD = 0.6 (line 28: `smoothstep(0.6 - smoothing, 0.6 + smoothing, dist)`)", () => {
    expect(MSDF_SDF_THRESHOLD).toBe(0.6);
  });

  it("MSDF_MIN_OPACITY_DISCARD = 0.001 (line 21 + line 31 early-discard thresholds)", () => {
    expect(MSDF_MIN_OPACITY_DISCARD).toBe(0.001);
  });
});

describe("msdfSmoothing — font.fragment.glsl:26", () => {
  it("scale = 1 → smoothing = 1/16 (baseline)", () => {
    expect(msdfSmoothing(1)).toBeCloseTo(1 / 16, 10);
  });

  it("scale = 2 → smoothing = 1/32 (half the AA band, sharper at 2× size)", () => {
    expect(msdfSmoothing(2)).toBeCloseTo(1 / 32, 10);
  });

  it("scale = 0.5 → smoothing = 1/8 (double AA band at half size)", () => {
    expect(msdfSmoothing(0.5)).toBeCloseTo(1 / 8, 10);
  });

  it("scale → ∞ forces smoothing → 0 (pure step function at huge text)", () => {
    // At scale = 1e9, smoothing = 6.25e-11 — numerically "zero" for any
    // AA purpose. Assert a strict upper bound rather than
    // toBeCloseTo (whose default 10-digit tolerance rejects the
    // sub-1e-10 residue).
    expect(msdfSmoothing(1e9)).toBeLessThan(1e-9);
  });
});

describe("msdfSmoothstep — GLSL-equivalent Hermite cubic", () => {
  it("x ≤ edge0 → 0", () => {
    expect(msdfSmoothstep(0, 1, -0.5)).toBe(0);
    expect(msdfSmoothstep(0, 1, 0)).toBe(0);
  });

  it("x ≥ edge1 → 1", () => {
    expect(msdfSmoothstep(0, 1, 1)).toBe(1);
    expect(msdfSmoothstep(0, 1, 2)).toBe(1);
  });

  it("midpoint → 0.5 (cubic symmetry)", () => {
    expect(msdfSmoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("matches 3t² - 2t³ formula at t = 0.25", () => {
    // t = 0.25 → smoothstep = 3(0.0625) - 2(0.015625) = 0.1875 - 0.03125 = 0.15625
    expect(msdfSmoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 10);
  });
});

describe("msdfAlpha — font.fragment.glsl:28 composition", () => {
  it("dist far below threshold (0.0) → alpha = 0 regardless of opacity", () => {
    expect(msdfAlpha(0.0, 1 / 16, 1.0)).toBe(0);
  });

  it("dist far above threshold+smoothing → alpha = opacity (fully opaque)", () => {
    const smoothing = msdfSmoothing(1);
    // 0.9 >> 0.6 + 1/16 = 0.6625; smoothstep returns 1, alpha = 1 * opacity.
    expect(msdfAlpha(0.9, smoothing, 0.8)).toBeCloseTo(0.8, 10);
  });

  it("dist exactly at threshold (0.6) → alpha = 0.5 × opacity (smoothstep midpoint)", () => {
    const smoothing = msdfSmoothing(1);
    // threshold - smoothing = 0.5375, threshold + smoothing = 0.6625.
    // smoothstep(0.5375, 0.6625, 0.6) = midpoint = 0.5.
    expect(msdfAlpha(0.6, smoothing, 1.0)).toBeCloseTo(0.5, 10);
  });

  it("opacity = 0 → alpha = 0 regardless of dist (pre-multiplication)", () => {
    expect(msdfAlpha(0.9, 1 / 16, 0.0)).toBe(0);
  });

  it("narrower smoothing (larger scale) → sharper transition", () => {
    // At dist = 0.55 (just below threshold), smaller smoothing should
    // give LOWER alpha (closer to 0 = off) because the AA band is
    // tighter around the threshold.
    const wider = msdfAlpha(0.55, msdfSmoothing(1), 1.0);
    const narrower = msdfAlpha(0.55, msdfSmoothing(8), 1.0);
    expect(narrower).toBeLessThan(wider);
  });
});

describe("msdfShouldDiscardOpacity — font.fragment.glsl:21-23", () => {
  it("opacity = 0 → discard", () => {
    expect(msdfShouldDiscardOpacity(0)).toBe(true);
  });

  it("opacity = 0.0009 → discard (below 0.001 threshold)", () => {
    expect(msdfShouldDiscardOpacity(0.0009)).toBe(true);
  });

  it("opacity = 0.001 → DO NOT discard (strict less-than)", () => {
    expect(msdfShouldDiscardOpacity(0.001)).toBe(false);
  });

  it("opacity = 1.0 → DO NOT discard", () => {
    expect(msdfShouldDiscardOpacity(1.0)).toBe(false);
  });
});

describe("msdfShouldDiscardAlpha — font.fragment.glsl:31-33", () => {
  it("uses the same threshold as the opacity check (both `< 0.001`)", () => {
    expect(msdfShouldDiscardAlpha(0.0005)).toBe(true);
    expect(msdfShouldDiscardAlpha(0.001)).toBe(false);
  });
});

describe("msdfPremultiply — font.fragment.glsl:37 `vec4(rgb, 1) × alpha`", () => {
  it("white at full alpha → unchanged RGB, alpha = 1", () => {
    const [r, g, b, a] = msdfPremultiply([1, 1, 1], 1);
    expect(r).toBe(1);
    expect(g).toBe(1);
    expect(b).toBe(1);
    expect(a).toBe(1);
  });

  it("red at half alpha → RGB scaled by 0.5, alpha = 0.5", () => {
    const [r, g, b, a] = msdfPremultiply([1, 0, 0], 0.5);
    expect(r).toBe(0.5);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(0.5);
  });

  it("alpha = 0 → all channels zero (consistent with the shader's discard branch)", () => {
    const [r, g, b, a] = msdfPremultiply([0.7, 0.3, 0.5], 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(0);
  });

  it("arbitrary color × arbitrary alpha: component = c × alpha", () => {
    const [r, g, b, a] = msdfPremultiply([0.2, 0.6, 0.8], 0.4);
    expect(r).toBeCloseTo(0.08, 10);
    expect(g).toBeCloseTo(0.24, 10);
    expect(b).toBeCloseTo(0.32, 10);
    expect(a).toBe(0.4);
  });
});
