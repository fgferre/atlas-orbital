import { describe, expect, it } from "vitest";

import {
  GRIDREC_BASE_COL_DIAG,
  GRIDREC_BASE_LINE_WIDTH,
  GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT,
  GRIDREC_CIRCLE_CENTER_SMOOTH_STOP,
  GRIDREC_CIRCLE_DIST_CULL,
  GRIDREC_CIRCLE_LEVEL1_F,
  GRIDREC_CIRCLE_LEVEL2_F,
  GRIDREC_CROSS_LINE_POW,
  GRIDREC_DIAG_LINE_POW,
  GRIDREC_DIAG_ROTATION_DEG,
  GRIDREC_HEIGHT_SCALE_FADE_EXPONENT,
  GRIDREC_N,
  GRIDREC_RAD,
  GRIDREC_SQUARE_LEVEL1_F,
  GRIDREC_SQUARE_LEVEL2_F,
  GRIDREC_SQUARE_LINE_WIDTH_MULT,
  GRIDREC_STYLE_BRANCH_THRESHOLD,
  GRIDREC_STYLE_CIRCULAR,
  GRIDREC_STYLE_SQUARE,
  gridRecCircleCenterAlphaMultiplier,
  gridRecCircleGridFunc,
  gridRecCircleIsCulled,
  gridRecHeightScaleFade,
  gridRecLineWidth,
  gridRecRadialAlpha,
  gridRecRemapUvToSigned,
  gridRecRotateUV,
  gridRecSmoothstep,
  gridRecSquareGridFunc,
  gridRecStyleToElevationMultiplier,
} from "./gridRecMath";

// Gaia source citations are file-line references under /tmp/gaiasky/
// relative to the repo root. Each `it(...)` asserts either a pinned
// constant from the shader, or a hand-derived sample input/output.

describe("gridRecMath — constants match gridrec.fragment.glsl literals", () => {
  it("N = 10.0 (gridrec.fragment.glsl:35)", () => {
    expect(GRIDREC_N).toBe(10.0);
  });

  it("BASE_LINE_WIDTH = 5.0 (gridrec.fragment.glsl:36)", () => {
    expect(GRIDREC_BASE_LINE_WIDTH).toBe(5.0);
  });

  it("RAD = PI / 180 (gridrec.fragment.glsl:37)", () => {
    expect(GRIDREC_RAD).toBeCloseTo(Math.PI / 180.0, 15);
  });

  it("BASE_COL_DIAG = (1.0, 0.492, 0.09, 0.3) (gridrec.fragment.glsl:38)", () => {
    expect(GRIDREC_BASE_COL_DIAG).toEqual([1.0, 0.492, 0.09, 0.3]);
  });

  it("circle culling threshold = 40.0 (gridrec.fragment.glsl:57)", () => {
    expect(GRIDREC_CIRCLE_DIST_CULL).toBe(40.0);
  });

  it("circle center smooth stop = 0.3 (gridrec.fragment.glsl:60)", () => {
    expect(GRIDREC_CIRCLE_CENTER_SMOOTH_STOP).toBe(0.3);
  });

  it("circle radial alpha exponent = 4.0 (gridrec.fragment.glsl:85)", () => {
    expect(GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT).toBe(4.0);
  });

  it("heightScale fade exponent = 0.5 (gridrec.fragment.glsl:87,115)", () => {
    expect(GRIDREC_HEIGHT_SCALE_FADE_EXPONENT).toBe(0.5);
  });

  it("circle level-1 frequency multiplier = 10.0 (gridrec.fragment.glsl:91)", () => {
    expect(GRIDREC_CIRCLE_LEVEL1_F).toBe(10.0);
  });

  it("circle level-2 frequency multiplier = 1.0 (gridrec.fragment.glsl:92)", () => {
    expect(GRIDREC_CIRCLE_LEVEL2_F).toBe(1.0);
  });

  it("square level-1 frequency multiplier = 400.0 (gridrec.fragment.glsl:119)", () => {
    expect(GRIDREC_SQUARE_LEVEL1_F).toBe(400.0);
  });

  it("square level-2 frequency multiplier = 40.0 (gridrec.fragment.glsl:120)", () => {
    expect(GRIDREC_SQUARE_LEVEL2_F).toBe(40.0);
  });

  it("square line-width multiplier = 2.0 (gridrec.fragment.glsl:116)", () => {
    expect(GRIDREC_SQUARE_LINE_WIDTH_MULT).toBe(2.0);
  });

  it("cross-line pow exponent = 2.0 (gridrec.fragment.glsl:67)", () => {
    expect(GRIDREC_CROSS_LINE_POW).toBe(2.0);
  });

  it("diagonal-line pow exponent = 3.0 (gridrec.fragment.glsl:72)", () => {
    expect(GRIDREC_DIAG_LINE_POW).toBe(3.0);
  });

  it("diagonal rotation = 45 degrees (gridrec.fragment.glsl:71)", () => {
    expect(GRIDREC_DIAG_ROTATION_DEG).toBe(45.0);
  });

  it("style ordinals match ModelEntityRenderSystem.java:314 (CIRCULAR=0, SQUARE=1)", () => {
    expect(GRIDREC_STYLE_CIRCULAR).toBe(0.0);
    expect(GRIDREC_STYLE_SQUARE).toBe(1.0);
    // Branch threshold in `gridrec.fragment.glsl:126` is `< 0.5`.
    expect(GRIDREC_STYLE_BRANCH_THRESHOLD).toBe(0.5);
  });
});

describe("gridRecStyleToElevationMultiplier — config.yaml:384 mapping", () => {
  it("CIRCULAR → 0.0 (Gaia default per config.yaml:384)", () => {
    expect(gridRecStyleToElevationMultiplier("CIRCULAR")).toBe(0.0);
  });

  it("SQUARE → 1.0 (opt-in)", () => {
    expect(gridRecStyleToElevationMultiplier("SQUARE")).toBe(1.0);
  });

  it("CIRCULAR value is below the shader's < 0.5 branch threshold", () => {
    expect(gridRecStyleToElevationMultiplier("CIRCULAR")).toBeLessThan(
      GRIDREC_STYLE_BRANCH_THRESHOLD
    );
  });

  it("SQUARE value is at or above the shader's < 0.5 branch threshold", () => {
    expect(gridRecStyleToElevationMultiplier("SQUARE")).toBeGreaterThanOrEqual(
      GRIDREC_STYLE_BRANCH_THRESHOLD
    );
  });
});

describe("gridRecRotateUV — gridrec.fragment.glsl:44-47", () => {
  it("0-degree rotation is identity", () => {
    const [x, y] = gridRecRotateUV(0.3, 0.7, 0);
    expect(x).toBeCloseTo(0.3, 10);
    expect(y).toBeCloseTo(0.7, 10);
  });

  it("90-degree rotation maps (1, 0) → (0, -1) per Gaia sign convention", () => {
    // Gaia: vec2(cos*x + sin*y, cos*y - sin*x)
    // rotation = PI/2: cos=0, sin=1 → (0*1 + 1*0, 0*0 - 1*1) = (0, -1)
    const [x, y] = gridRecRotateUV(1, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-1, 10);
  });

  it("45-degree rotation preserves length", () => {
    const [x, y] = gridRecRotateUV(0.5, 0.5, 45 * GRIDREC_RAD);
    expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(0.5, 0.5), 10);
  });

  it("45-degree rotation of (0.5, 0) matches expected components", () => {
    // rot=PI/4: cos = sin = sqrt(2)/2 ≈ 0.7071
    // (sqrt2/2 * 0.5 + sqrt2/2 * 0, sqrt2/2 * 0 - sqrt2/2 * 0.5)
    // = (0.3535, -0.3535)
    const [x, y] = gridRecRotateUV(0.5, 0, 45 * GRIDREC_RAD);
    expect(x).toBeCloseTo(0.3535533905, 8);
    expect(y).toBeCloseTo(-0.3535533905, 8);
  });
});

describe("gridRecRemapUvToSigned — gridrec.fragment.glsl:84,112", () => {
  it("tc=0 → -1 (corner of the unit quad)", () => {
    expect(gridRecRemapUvToSigned(0)).toBe(-1.0);
  });

  it("tc=0.5 → 0 (center of the unit quad)", () => {
    expect(gridRecRemapUvToSigned(0.5)).toBe(0.0);
  });

  it("tc=1 → 1 (far corner of the unit quad)", () => {
    expect(gridRecRemapUvToSigned(1)).toBe(1.0);
  });
});

describe("gridRecRadialAlpha — gridrec.fragment.glsl:85,113", () => {
  it("at origin (tc=0,0): 1 - 0^4 = 1", () => {
    expect(gridRecRadialAlpha(0, 0)).toBe(1.0);
  });

  it("at unit radius on axis: 1 - 1^4 = 0", () => {
    expect(gridRecRadialAlpha(1, 0)).toBeCloseTo(0.0, 10);
  });

  it("at (0.5, 0): 1 - 0.5^4 = 0.9375", () => {
    expect(gridRecRadialAlpha(0.5, 0)).toBeCloseTo(0.9375, 10);
  });

  it("beyond unit radius clamps to 0 (not negative)", () => {
    expect(gridRecRadialAlpha(2, 0)).toBe(0.0);
  });

  it("diagonal radius = sqrt(2) clamps to 0 (at unit-quad corner)", () => {
    expect(gridRecRadialAlpha(1, 1)).toBe(0.0);
  });
});

describe("gridRecHeightScaleFade — gridrec.fragment.glsl:87,115", () => {
  it("heightScale=1 → fade=1 (no attenuation)", () => {
    expect(gridRecHeightScaleFade(1.0)).toBe(1.0);
  });

  it("heightScale=0 → fade=0 (full attenuation)", () => {
    expect(gridRecHeightScaleFade(0.0)).toBe(0.0);
  });

  it("heightScale=0.25 → fade=0.5 (sqrt of 0.25)", () => {
    expect(gridRecHeightScaleFade(0.25)).toBeCloseTo(0.5, 10);
  });

  it("heightScale=0.64 → fade=0.8 (sqrt of 0.64)", () => {
    expect(gridRecHeightScaleFade(0.64)).toBeCloseTo(0.8, 10);
  });
});

describe("gridRecLineWidth — gridrec.fragment.glsl:88,116", () => {
  it("CIRCULAR: lw = |dFdx| * 5 * u_ts", () => {
    expect(gridRecLineWidth(0.01, 1.4, "CIRCULAR")).toBeCloseTo(
      0.01 * 5 * 1.4,
      10
    );
  });

  it("SQUARE: lw = |dFdx| * 5 * u_ts * 2 (one extra factor vs CIRCULAR)", () => {
    expect(gridRecLineWidth(0.01, 1.4, "SQUARE")).toBeCloseTo(
      0.01 * 5 * 1.4 * 2,
      10
    );
  });

  it("zero-width dFdx → zero line width in both styles", () => {
    expect(gridRecLineWidth(0, 1.4, "CIRCULAR")).toBe(0);
    expect(gridRecLineWidth(0, 1.4, "SQUARE")).toBe(0);
  });
});

describe("gridRecCircleGridFunc — gridrec.fragment.glsl:54-55,64", () => {
  it("tc=(0,0): dist=0 → cos(0) = 1", () => {
    expect(gridRecCircleGridFunc(0, 0, 1, 1)).toBeCloseTo(1.0, 10);
  });

  it("with N=10, f=1, d=1, tc=(0.025, 0): coord=(0.5, 0), dist=0.5, cos(PI/2)=0", () => {
    // tc * d * f * N * 2 = 0.025 * 1 * 1 * 10 * 2 = 0.5
    expect(gridRecCircleGridFunc(0.025, 0, 1, 1)).toBeCloseTo(0.0, 10);
  });

  it("increasing f scales frequency — f=10 gives 10x more dist than f=1 for same tc", () => {
    // tc = 0.01, d=1, f=1 → coord = 0.2, dist = 0.2
    // tc = 0.01, d=1, f=10 → coord = 2.0, dist = 2.0
    // cos(PI * 0.2) vs cos(PI * 2.0) = cos(2π) ≈ 1
    expect(gridRecCircleGridFunc(0.01, 0, 1, 10)).toBeCloseTo(1.0, 6);
    // whereas the f=1 case lands in the ring
    expect(gridRecCircleGridFunc(0.01, 0, 1, 1)).toBeCloseTo(
      Math.cos(Math.PI * 0.2),
      10
    );
  });
});

describe("gridRecSquareGridFunc — gridrec.fragment.glsl:102,112", () => {
  it("tc=0: cos(0) = 1", () => {
    expect(gridRecSquareGridFunc(0, 1, 1)).toBeCloseTo(1.0, 10);
  });

  it("abs() applied to tc: negative tc gives same result as positive", () => {
    expect(gridRecSquareGridFunc(-0.3, 1, 1)).toBeCloseTo(
      gridRecSquareGridFunc(0.3, 1, 1),
      10
    );
  });

  it("tc=0.5, f=1, d=1: cos(PI*0.5) = 0", () => {
    expect(gridRecSquareGridFunc(0.5, 1, 1)).toBeCloseTo(0.0, 10);
  });

  it("tc=1/400, f=400, d=1: cos(PI*1) = -1 (square level-1 frequency lands on a line center)", () => {
    expect(
      gridRecSquareGridFunc(1 / 400, 1, GRIDREC_SQUARE_LEVEL1_F)
    ).toBeCloseTo(-1.0, 10);
  });
});

describe("gridRecCircleCenterAlphaMultiplier — gridrec.fragment.glsl:59-61", () => {
  it("dist=0 → multiplier=0 (hole at center)", () => {
    expect(gridRecCircleCenterAlphaMultiplier(0)).toBe(0.0);
  });

  it("dist=0.3 (edge of smooth zone) → multiplier=1 (no further dampen)", () => {
    expect(gridRecCircleCenterAlphaMultiplier(0.3)).toBe(1.0);
  });

  it("dist=0.6 (outside smooth zone) → multiplier=1", () => {
    expect(gridRecCircleCenterAlphaMultiplier(0.6)).toBe(1.0);
  });

  it("dist=0.15 (halfway in smooth zone) → smoothstep(0, 0.3, 0.15) = 0.5", () => {
    expect(gridRecCircleCenterAlphaMultiplier(0.15)).toBeCloseTo(0.5, 10);
  });
});

describe("gridRecCircleIsCulled — gridrec.fragment.glsl:57-58", () => {
  it("dist=0 → not culled", () => {
    expect(gridRecCircleIsCulled(0)).toBe(false);
  });

  it("dist=40 (boundary) → not culled (strict >)", () => {
    expect(gridRecCircleIsCulled(40)).toBe(false);
  });

  it("dist=40.001 → culled", () => {
    expect(gridRecCircleIsCulled(40.001)).toBe(true);
  });

  it("dist=1000 → culled", () => {
    expect(gridRecCircleIsCulled(1000)).toBe(true);
  });
});

describe("gridRecSmoothstep — GLSL semantics", () => {
  it("x ≤ edge0 → 0", () => {
    expect(gridRecSmoothstep(0, 1, -0.5)).toBe(0);
    expect(gridRecSmoothstep(0, 1, 0)).toBe(0);
  });

  it("x ≥ edge1 → 1", () => {
    expect(gridRecSmoothstep(0, 1, 1)).toBe(1);
    expect(gridRecSmoothstep(0, 1, 1.5)).toBe(1);
  });

  it("x at midpoint → 0.5", () => {
    expect(gridRecSmoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("non-unit edges: smoothstep(2, 4, 3) = 0.5", () => {
    expect(gridRecSmoothstep(2, 4, 3)).toBeCloseTo(0.5, 10);
  });
});
