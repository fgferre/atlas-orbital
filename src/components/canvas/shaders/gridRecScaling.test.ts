import { describe, expect, it } from "vitest";

import {
  getGridRecAuLockedScaling,
  getGridRecScaling,
  gridRecBaseRingWorldRadius,
  gridRecLint,
  GRID_REC_DECADE_MAX,
  GRID_REC_DECADE_MIN,
} from "./gridRecScaling";
import { gridRecCircleGridFunc } from "./gridRecMath";

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

// Atlas grid plane + shader ring constants (gridRecursiveConfig.ts:10,
// gridRecMath.ts:46,31). Pinned here so the lock math is verified
// against the real geometry the shader renders.
const WORLD_SIZE = 40000;
const LEVEL1_F = 10.0;
const GRID_N = 10.0;

describe("gridRecBaseRingWorldRadius — level-1 ring world radius at tessQuality=1", () => {
  it("derives 200 world units (first BRIGHT ring at dist=2) for atlas's 40k plane + Gaia ring constants", () => {
    // Bright rings are at cos(π·dist)=1 → even dist (2,4,…); dist=1 is a
    // dark trough. R at the first bright ring (dist=2), tessQuality=1:
    // R = (worldSize/2) / (LEVEL1_F · N) = 20000 / 100 = 200.
    // (Anchoring to dist=1 → 100 would pin bodies into the dark gap.)
    expect(gridRecBaseRingWorldRadius(WORLD_SIZE, LEVEL1_F, GRID_N)).toBe(200);
  });
});

describe("getGridRecAuLockedScaling — pins the level-1 ring to the AU-decade world radius", () => {
  const baseRingRadius = gridRecBaseRingWorldRadius(
    WORLD_SIZE,
    LEVEL1_F,
    GRID_N
  );
  // baseRingRadius / tessQuality is the world radius of the first bright
  // ring (shader dist=2). Locking is correct iff that equals
  // auToWorld(10^decade) — i.e. a body at 10^decade AU sits on the ring.
  const lockedRingWorldRadius = (tessQuality: number) =>
    baseRingRadius / tessQuality;

  // Realistic transform: linear au × 1000 (AU_TO_3D_UNITS).
  const realisticAuToWorld = (au: number) => au * 1000;

  it("realistic: ring k=1 lands exactly on the AU-decade world radius", () => {
    // effectiveAU within decade 0 ([1,10) AU) → lock to auToWorld(1)=1000.
    for (const effAU of [1, 3, 9.9]) {
      const r = getGridRecAuLockedScaling(
        effAU,
        realisticAuToWorld,
        baseRingRadius
      );
      expect(lockedRingWorldRadius(r.tessQuality)).toBeCloseTo(1000, 6);
    }
    // decade 1 ([10,100) AU) → lock to auToWorld(10)=10000.
    const r2 = getGridRecAuLockedScaling(
      40,
      realisticAuToWorld,
      baseRingRadius
    );
    expect(lockedRingWorldRadius(r2.tessQuality)).toBeCloseTo(10000, 6);
  });

  it("a body at 10^decade AU lands on a BRIGHT ring (cos(π·dist)=1), not a trough — guards the dist=2 anchor", () => {
    // The shader lights rings where cos(π·dist)=1 (dist = 2,4,6…); dist=1
    // is a dark trough. A body at 10^decade AU sits at world radius
    // auToWorld(10^decade); that radius MUST coincide with a bright ring.
    // This is exactly what the algebraic baseRingRadius/tessQuality
    // identity could NOT catch — it holds for both the dist=1 trough and
    // the dist=2 ring; only the shader func distinguishes them. (Fails
    // with the old dist=1 anchor: gridFunc would read ≈ −1.)
    const halfPlane = WORLD_SIZE / 2;
    for (const effAU of [1, 3, 9.9, 40, 250]) {
      const r = getGridRecAuLockedScaling(
        effAU,
        realisticAuToWorld,
        baseRingRadius
      );
      const decadeLowerAU = Math.pow(10, Math.floor(Math.log10(effAU)));
      const bodyRadius = realisticAuToWorld(decadeLowerAU);
      const tcX = bodyRadius / halfPlane; // radial sample on the +x axis
      const gridFunc = gridRecCircleGridFunc(tcX, 0, r.tessQuality, LEVEL1_F);
      expect(gridFunc).toBeCloseTo(1, 6); // bright ring, NOT a trough (−1)
    }
  });

  it("locked ring radius is INDEPENDENT of fine camera position within a decade (no drift)", () => {
    // The core scale-lock property the old walk lacked: moving the
    // camera within a decade must NOT move the ring.
    const a = getGridRecAuLockedScaling(
      1.1,
      realisticAuToWorld,
      baseRingRadius
    );
    const b = getGridRecAuLockedScaling(
      9.8,
      realisticAuToWorld,
      baseRingRadius
    );
    expect(a.tessQuality).toBe(b.tessQuality);
    expect(lockedRingWorldRadius(a.tessQuality)).toBeCloseTo(1000, 6);
  });

  it("didactic: ring k=1 lands on the compressed AU-decade world radius (so a planet at 10^decade AU sits on it)", () => {
    // Representative compressed transform: decade boundaries map to
    // distinct compressed world radii (NOT linear). The lock must use
    // whatever auToWorld returns, so the ring follows the compression.
    const didacticAuToWorld = (au: number) => {
      if (au <= 0.1) return 50;
      if (au <= 1) return 440;
      if (au <= 10) return 1200;
      return 2485;
    };
    // effectiveAU in [1,10) → decade 0 → lock to auToWorld(1)=440.
    const r = getGridRecAuLockedScaling(5.2, didacticAuToWorld, baseRingRadius);
    expect(lockedRingWorldRadius(r.tessQuality)).toBeCloseTo(440, 6);
    // effectiveAU in [10,100) → decade 1 → lock to auToWorld(10)=1200.
    const r2 = getGridRecAuLockedScaling(30, didacticAuToWorld, baseRingRadius);
    expect(lockedRingWorldRadius(r2.tessQuality)).toBeCloseTo(1200, 6);
  });

  it("heightScale fades 1 → 0 across the decade in AU space", () => {
    // Near the decade lower bound → heightScale ≈ 1.
    const lower = getGridRecAuLockedScaling(
      1.001,
      realisticAuToWorld,
      baseRingRadius
    );
    expect(lower.heightScale).toBeGreaterThan(0.99);
    // Near the decade upper bound → heightScale ≈ 0.
    const upper = getGridRecAuLockedScaling(
      9.99,
      realisticAuToWorld,
      baseRingRadius
    );
    expect(upper.heightScale).toBeLessThan(0.01);
    // Mid-decade is between.
    const mid = getGridRecAuLockedScaling(
      5,
      realisticAuToWorld,
      baseRingRadius
    );
    expect(mid.heightScale).toBeGreaterThan(0);
    expect(mid.heightScale).toBeLessThan(1);
  });

  it("handles the saturated regime (capped auToWorld) without NaN / runaway", () => {
    // Past the didactic cap, auToWorld returns the SAME capped world
    // radius for every farther decade, so the ring freezes at the cap
    // exactly as the (also-capped) planet positions do.
    const cappedAuToWorld = (au: number) => Math.min(au * 100, 3200);
    for (const effAU of [400, 5000, 1e6]) {
      const r = getGridRecAuLockedScaling(
        effAU,
        cappedAuToWorld,
        baseRingRadius
      );
      expect(Number.isFinite(r.tessQuality)).toBe(true);
      expect(Number.isFinite(r.heightScale)).toBe(true);
      expect(lockedRingWorldRadius(r.tessQuality)).toBeCloseTo(3200, 6);
    }
  });

  it("falls back to a sane innermost decade for degenerate effective-AU", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = getGridRecAuLockedScaling(
        bad,
        realisticAuToWorld,
        baseRingRadius
      );
      expect(Number.isFinite(r.tessQuality)).toBe(true);
      expect(r.tessQuality).toBeGreaterThan(0);
      expect(r.heightScale).toBe(1);
      // Fallback locks to auToWorld(1) = 1000.
      expect(lockedRingWorldRadius(r.tessQuality)).toBeCloseTo(1000, 6);
    }
  });
});
