import { describe, expect, it } from "vitest";

import {
  getGridRecScaling,
  gridRecLint,
  GRID_REC_DECADE_MAX,
  GRID_REC_DECADE_MIN,
} from "./gridRecScaling";

// Citations under /tmp/gaiasky/core/src/gaiasky/scene/system/update/
// unless otherwise noted.

describe("gridRecLint — GridRecUpdater mirrors MathUtilsDouble.lint", () => {
  it("interpolates linearly between startOut and endOut", () => {
    expect(gridRecLint(0.5, 0, 1, 0, 10)).toBeCloseTo(5, 10);
  });

  it("returns startOut at val=min", () => {
    expect(gridRecLint(0, 0, 1, 7, 42)).toBe(7);
  });

  it("returns endOut at val=max", () => {
    expect(gridRecLint(1, 0, 1, 7, 42)).toBe(42);
  });

  it("handles inverted output range (startOut > endOut)", () => {
    // getGridScaling calls lint with (1, 0) so the fade descends.
    expect(gridRecLint(0.5, 0, 1, 1, 0)).toBeCloseTo(0.5, 10);
    expect(gridRecLint(0.1, 0.1, 1.0, 1, 0)).toBe(1);
    expect(gridRecLint(1.0, 0.1, 1.0, 1, 0)).toBe(0);
  });

  it("handles negative-exponent decade ranges (val=5e-3 in [1e-3, 1e-2])", () => {
    expect(gridRecLint(5e-3, 1e-3, 1e-2, 1, 0)).toBeCloseTo(
      0.5555555555555556,
      10
    );
  });
});

describe("getGridRecScaling — decade-bracket algorithm", () => {
  it("decade range covers -25 to 25 (GridRecUpdater.java:152)", () => {
    expect(GRID_REC_DECADE_MIN).toBe(-25);
    expect(GRID_REC_DECADE_MAX).toBe(25);
  });

  it("cameraDistance=1 sits at the upper bound of decade i=0 → loop advances to i=1, tessQuality=0.1, heightScale=1", () => {
    // 1 < 10^0 is false (1 < 1 false), so i=0 skipped. At i=1,
    // 1 < 10^1 = 10 is true. lower = 10^0 = 1.
    // lint(1, 1, 10, 1, 0) = 1.
    // tessQuality = 1 * 10^-1 = 0.1.
    const r = getGridRecScaling(1);
    expect(r.heightScale).toBe(1);
    expect(r.tessQuality).toBeCloseTo(0.1, 10);
  });

  it("cameraDistance=0.5 lands in decade i=0 (between 0.1 and 1)", () => {
    // 0.5 < 10^0 = 1 is true. lower = 10^-1 = 0.1.
    // lint(0.5, 0.1, 1.0, 1, 0) ≈ 1 - (0.5-0.1)/0.9 ≈ 0.5556.
    // tessQuality = 0.5 * 10^0 = 0.5.
    const r = getGridRecScaling(0.5);
    expect(r.tessQuality).toBeCloseTo(0.5, 10);
    expect(r.heightScale).toBeCloseTo(0.5555555555555556, 10);
  });

  it("cameraDistance=5 lands in decade i=1 (between 1 and 10)", () => {
    // lint(5, 1, 10, 1, 0) = 1 - (5-1)/9 ≈ 0.5556.
    // tessQuality = 5 * 10^-1 = 0.5.
    const r = getGridRecScaling(5);
    expect(r.tessQuality).toBeCloseTo(0.5, 10);
    expect(r.heightScale).toBeCloseTo(0.5555555555555556, 10);
  });

  it("cameraDistance=50 lands in decade i=2 (between 10 and 100) — same normalized output as 5 and 0.5 (scale invariance)", () => {
    const r = getGridRecScaling(50);
    expect(r.tessQuality).toBeCloseTo(0.5, 10);
    expect(r.heightScale).toBeCloseTo(0.5555555555555556, 10);
  });

  it("cameraDistance near decade lower bound yields heightScale ≈ 1", () => {
    const r = getGridRecScaling(1.01);
    expect(r.heightScale).toBeGreaterThan(0.99);
  });

  it("cameraDistance near decade upper bound yields heightScale ≈ 0", () => {
    const r = getGridRecScaling(9.99);
    expect(r.heightScale).toBeLessThan(0.002);
  });

  it("cameraDistance=0.05 lands in decade i=-1 (between 0.01 and 0.1)", () => {
    const r = getGridRecScaling(0.05);
    // lint(0.05, 0.01, 0.1, 1, 0) = 1 - (0.05-0.01)/0.09 ≈ 0.5556
    expect(r.tessQuality).toBeCloseTo(0.5, 10);
    expect(r.heightScale).toBeCloseTo(0.5555555555555556, 10);
  });

  it("cameraDistance=0 falls past the loop without matching any upper bound", () => {
    // 0 is NOT less than pow(10, -25) (which is ~1e-25, positive).
    // Actually 0 < 1e-25 is true, so the first iteration at i=-25
    // DOES match. lower = 10^-26 (tiny), upper = 10^-25.
    // lint(0, 1e-26, 1e-25, 1, 0) ≈ 1 (since 0 is below lower).
    // tessQuality = 0 * 10^25 = 0.
    const r = getGridRecScaling(0);
    expect(r.tessQuality).toBe(0);
    // heightScale may be slightly > 1 when val < lower (no clamp in Gaia) — trust the math.
    expect(r.heightScale).toBeGreaterThanOrEqual(1);
  });

  it("cameraDistance above every decade (>= 10^25) hits the fallback: tessQuality=cameraDistance, heightScale=0", () => {
    // Gaia's res.set(au, 0d) default at line 150.
    const huge = Math.pow(10, 26);
    const r = getGridRecScaling(huge);
    expect(r.tessQuality).toBe(huge);
    expect(r.heightScale).toBe(0);
  });

  it("cameraDistance=1000 lands in decade i=3 (typical atlas PLANET_ORBIT range)", () => {
    // 1000 < 10^4 = 10000 true. lower = 10^3 = 1000.
    // lint(1000, 1000, 10000, 1, 0) = 1.
    // tessQuality = 1000 * 10^-4 = 0.1.
    const r = getGridRecScaling(1000);
    expect(r.tessQuality).toBeCloseTo(0.1, 10);
    expect(r.heightScale).toBe(1);
  });

  it("tessQuality output always stays in [0.1, 1.0] within a decade (shader branch relies on this)", () => {
    // gridrec.fragment.glsl:186 uses u_tessQuality as a frequency
    // multiplier for the level-1 rings; driving it outside [0.1, 1]
    // would break the "1 AU / 10 AU / 100 AU" spacing visual.
    for (const d of [0.15, 0.5, 0.99, 1.5, 7, 50, 500, 5000]) {
      const r = getGridRecScaling(d);
      expect(r.tessQuality).toBeGreaterThanOrEqual(0.1 - 1e-12);
      expect(r.tessQuality).toBeLessThanOrEqual(1.0 + 1e-12);
    }
  });

  it("heightScale output always stays in [0, 1] within a decade", () => {
    for (const d of [0.15, 0.5, 0.99, 1.5, 7, 50, 500, 5000]) {
      const r = getGridRecScaling(d);
      expect(r.heightScale).toBeGreaterThanOrEqual(0);
      expect(r.heightScale).toBeLessThanOrEqual(1);
    }
  });
});
