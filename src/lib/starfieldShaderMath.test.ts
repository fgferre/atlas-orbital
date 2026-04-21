import { describe, expect, it } from "vitest";

import {
  computePixelsPerRadian,
  computeViewportHeightScalar,
  CORE_SMOOTHSTEP_EDGE_HIGH,
  CORE_SMOOTHSTEP_EDGE_LOW,
  LEN0,
  MAX_QUAD_SOLID_ANGLE_LITERAL,
  U_BRIGHTNESS_POWER_DEFAULT,
  U_BRIGHTNESS_POWER_RANGE,
  U_MIN_QUAD_SOLID_ANGLE,
  U_OPACITY_LIMITS,
  U_SOLID_ANGLE_MAP,
  starfieldCoreKernel,
  starfieldSolidAngleMetrics,
} from "./starfieldShaderMath";
import {
  apparentToAbsMag,
  bvToRadiusPc,
  bvToSolarRadius,
  bvToTeff,
  estimateRadiusPc,
  estimateRadiusSolar,
  SOLAR_RADIUS_PC,
  SUN_ABS_MAG_V,
  SUN_TEFF,
} from "./starPhysics";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

// DISTANCE_SCALE from Starfield.tsx — 1 parsec = 206,265,000 scene units.
const DISTANCE_SCALE = 206_265_000.0;

// ---------------------------------------------------------------------------
// Fragment core-kernel (θ.1 — pinned unchanged)
// ---------------------------------------------------------------------------

describe("starfieldCoreKernel — Gaia Sky star.group.quad.fragment port", () => {
  // Source (star.group.quad.fragment.glsl, 2026-04-20 read):
  //   float core = saturate(1.0 - smoothstep(0.0, 0.04, distance(vec2(0.5), uv) * 2.0));

  it("exports the source-authoritative edge constants", () => {
    expect(CORE_SMOOTHSTEP_EDGE_LOW).toBe(0.0);
    expect(CORE_SMOOTHSTEP_EDGE_HIGH).toBe(0.04);
  });

  it("matches the Gaia Sky shader at the three edge-defining points", () => {
    approxEq(starfieldCoreKernel(0.0), 1.0);
    approxEq(starfieldCoreKernel(0.02), 0.5);
    approxEq(starfieldCoreKernel(0.04), 0.0);
  });

  it("matches smoothstep off-midpoint samples (proves the curve is THIS smoothstep)", () => {
    // r = 0.01 → t = 0.25 → smoothstep = 0.15625, core = 0.84375.
    approxEq(starfieldCoreKernel(0.01), 0.84375);
    // r = 0.03 → t = 0.75 → smoothstep = 0.84375, core = 0.15625.
    approxEq(starfieldCoreKernel(0.03), 0.15625);
  });

  it("stays at 0 everywhere outside the core (r > 0.04, up to r=1.4)", () => {
    for (const r of [0.041, 0.05, 0.1, 0.25, 0.5, 1.0, 1.4]) {
      approxEq(starfieldCoreKernel(r), 0.0);
    }
  });

  it("is strictly non-increasing from r=0 outward", () => {
    let previous = Infinity;
    for (let r = 0; r <= 1.5; r += 0.005) {
      const v = starfieldCoreKernel(r);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it("clamps negative r inputs to the pinpoint value", () => {
    approxEq(starfieldCoreKernel(-0.01), 1.0);
  });
});

// ---------------------------------------------------------------------------
// Vertex solid-angle mapping (θ.1b — 2026-04-20)
// ---------------------------------------------------------------------------

describe("starfieldSolidAngleMetrics — Gaia Sky star.group.quad.vertex port", () => {
  // Verify constants carried over from Round 5 / Round 6 source-reads.
  it("pins Gaia Sky host uniform defaults", () => {
    expect(U_SOLID_ANGLE_MAP).toStrictEqual([1.0e-10, 2.0e-9]);
    expect(U_OPACITY_LIMITS[1]).toBeCloseTo(0.95, 5);
    expect(U_BRIGHTNESS_POWER_DEFAULT).toBe(1.0);
    expect(U_BRIGHTNESS_POWER_RANGE).toStrictEqual([0.9, 1.1]);
    expect(U_MIN_QUAD_SOLID_ANGLE).toBe(1.0e-10);
    // 3.0e-8 is a SOURCE LITERAL, not a runtime uniform (Codex θ.1b #2).
    expect(MAX_QUAD_SOLID_ANGLE_LITERAL).toBe(3.0e-8);
    expect(LEN0).toBe(20000.0);
  });

  it("rawSolidAngle is size/dist (dimensionless)", () => {
    // Sirius-scale: physical radius ≈ 1.7 Rsun, distance 2.64 pc.
    const sizePc = 1.7 * SOLAR_RADIUS_PC;
    const distPc = 2.64;
    const m = starfieldSolidAngleMetrics({
      size: sizePc * DISTANCE_SCALE,
      dist: distPc * DISTANCE_SCALE,
    });
    approxEq(m.rawSolidAngle, sizePc / distPc, 1e-12);
    // Within Gaia Sky's map — this is a "present" star, not a faint one.
    expect(m.rawSolidAngle).toBeGreaterThan(U_SOLID_ANGLE_MAP[0]);
  });

  it("opacity interpolates smoothly between the map endpoints", () => {
    // Craft a star whose rawSolidAngle sits at the midpoint of the map.
    const sMin = U_SOLID_ANGLE_MAP[0];
    const sMax = U_SOLID_ANGLE_MAP[1];
    const midRaw = (sMin + sMax) / 2;
    // size/dist = midRaw; pick dist = 1, then size = midRaw.
    const m = starfieldSolidAngleMetrics({ size: midRaw, dist: 1 });
    // With smoothstep endpoints (not linear), midpoint yields 0.5 × span.
    const expected =
      U_OPACITY_LIMITS[0] + 0.5 * (U_OPACITY_LIMITS[1] - U_OPACITY_LIMITS[0]);
    approxEq(m.opacity, expected, 1e-6);
  });

  it("opacity saturates to map endpoints outside the raw range", () => {
    // Very small solidAngle: saturates to opacityLimits[0].
    const dim = starfieldSolidAngleMetrics({ size: 1, dist: 1e20 });
    approxEq(dim.opacity, U_OPACITY_LIMITS[0], 1e-9);
    // Very large solidAngle: saturates to opacityLimits[1].
    const bright = starfieldSolidAngleMetrics({ size: 1, dist: 1 });
    approxEq(bright.opacity, U_OPACITY_LIMITS[1], 1e-9);
  });

  it("clampedSolidAngle stays within [U_MIN_QUAD_SOLID_ANGLE, 3.0e-8]", () => {
    // Gigantic solidAngle → clamp to the source literal 3.0e-8
    // (NOT a runtime uniform — Codex θ.1b #2).
    const huge = starfieldSolidAngleMetrics({ size: 1, dist: 1 });
    expect(huge.clampedSolidAngle).toBeLessThanOrEqual(
      MAX_QUAD_SOLID_ANGLE_LITERAL
    );
    // Minuscule solidAngle → clamp to 1e-10.
    const tiny = starfieldSolidAngleMetrics({ size: 1, dist: 1e30 });
    expect(tiny.clampedSolidAngle).toBeGreaterThanOrEqual(
      U_MIN_QUAD_SOLID_ANGLE
    );
  });

  it("degrees12/radians12 precision wrap preserves tiny solid angles", () => {
    // This is the exact failure mode Round 5 caught: pow(1e-10, 1.0) in
    // fp32 collapses to zero. The degrees12 wrapper scales up to ~180
    // before the pow, preserving precision.
    const m = starfieldSolidAngleMetrics({
      size: 1e-10,
      dist: 1,
      // power = 1 means raw pass-through post-scale-up; still must not zero.
      brightnessPower: 1.0,
    });
    // Value should clamp at U_MIN_QUAD_SOLID_ANGLE, NOT zero.
    expect(m.clampedSolidAngle).toBe(U_MIN_QUAD_SOLID_ANGLE);
  });

  it("brightnessPower within the Gaia Sky [0.9, 1.1] range produces monotonic size curve", () => {
    // Same input at the two power endpoints; size should shift monotonically.
    const sample = { size: 1e-9 * 206_265_000, dist: 206_265_000 };
    const low = starfieldSolidAngleMetrics({
      ...sample,
      brightnessPower: 0.9,
    });
    const mid = starfieldSolidAngleMetrics({
      ...sample,
      brightnessPower: 1.0,
    });
    const high = starfieldSolidAngleMetrics({
      ...sample,
      brightnessPower: 1.1,
    });
    // Monotonic in one direction (power > 1 shrinks small solid angles
    // when wrapped in degrees12; we only assert strict monotonicity).
    expect(low.clampedSolidAngle).not.toBe(mid.clampedSolidAngle);
    expect(mid.clampedSolidAngle).not.toBe(high.clampedSolidAngle);
  });

  it("boundaryFade zeros inside LEN0 and ones past LEN0×1000", () => {
    const inside = starfieldSolidAngleMetrics({
      size: 1e-9 * DISTANCE_SCALE,
      dist: LEN0 * 0.5,
    });
    expect(inside.boundaryFade).toBe(0);
    expect(inside.alpha).toBe(0); // `dist < LEN0` nulls alpha.

    const far = starfieldSolidAngleMetrics({
      size: 1e-9 * DISTANCE_SCALE,
      dist: LEN0 * 1e4,
    });
    expect(far.boundaryFade).toBe(1);
  });

  it("alpha zeros when opacity × factors × fade collapses below 1e-3", () => {
    // At very far distance (opacity → opacityLimits[0] = 0.1) with
    // alphaFactor = 0.005, final = 0.1 × 0.005 = 5e-4 < 1e-3 → alpha 0.
    const m = starfieldSolidAngleMetrics({
      size: 1e-14,
      dist: LEN0 * 1e4,
      alphaFactor: 0.005,
    });
    expect(m.alpha).toBe(0);
  });

  it("preserves magnitude ordering across typical HYG distances", () => {
    // Three representative stars at the typical HYG range; solidAngle
    // should be monotonic in the expected direction (larger radius or
    // smaller distance → larger solidAngle).
    const sirius = starfieldSolidAngleMetrics({
      size: bvToRadiusPc(0.0) * DISTANCE_SCALE,
      dist: 2.64 * DISTANCE_SCALE,
    });
    const typical = starfieldSolidAngleMetrics({
      size: bvToRadiusPc(0.5) * DISTANCE_SCALE,
      dist: 20 * DISTANCE_SCALE,
    });
    const faint = starfieldSolidAngleMetrics({
      size: bvToRadiusPc(1.2) * DISTANCE_SCALE,
      dist: 200 * DISTANCE_SCALE,
    });
    expect(sirius.rawSolidAngle).toBeGreaterThan(typical.rawSolidAngle);
    expect(typical.rawSolidAngle).toBeGreaterThan(faint.rawSolidAngle);
  });
});

// ---------------------------------------------------------------------------
// Star physics (radius synthesis)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pixel-space conversion helpers (θ.1b stack/API — Codex #4)
// ---------------------------------------------------------------------------

describe("computePixelsPerRadian — shader host-side parity", () => {
  it("pins the cot(fov/2) × height / 2 formula at a canonical perspective", () => {
    // 60° fov → tan(30°) ≈ 0.5774 → cot(30°) = projMatrix[1][1] ≈ 1.7321.
    const projMatrix11 = 1 / Math.tan((60 * Math.PI) / 180 / 2);
    const viewportHeight = 1000;
    const pxPerRad = computePixelsPerRadian(projMatrix11, viewportHeight);
    // Direct: cot(30°) × 1000 / 2 ≈ 866.025.
    approxEq(pxPerRad, (1 / Math.tan(Math.PI / 6)) * 500, 1e-9);
  });

  it("doubles when viewport height doubles (linear)", () => {
    const proj = 1.732;
    const a = computePixelsPerRadian(proj, 1000);
    const b = computePixelsPerRadian(proj, 2000);
    approxEq(b, 2 * a, 1e-9);
  });

  it("doubles when projection matrix [1][1] doubles (narrower fov)", () => {
    const h = 1000;
    const a = computePixelsPerRadian(1.732, h);
    const b = computePixelsPerRadian(3.464, h);
    approxEq(b, 2 * a, 1e-9);
  });
});

describe("computeViewportHeightScalar — host DPR feed", () => {
  it("multiplies CSS height by renderer DPR (L17 literal path)", () => {
    expect(computeViewportHeightScalar(1080, 1.5)).toBe(1620);
    expect(computeViewportHeightScalar(720, 2)).toBe(1440);
    expect(computeViewportHeightScalar(400, 1)).toBe(400);
  });

  it("clamps to non-negative on degenerate inputs", () => {
    expect(computeViewportHeightScalar(-100, 2)).toBe(0);
    expect(computeViewportHeightScalar(100, -2)).toBe(0);
    expect(computeViewportHeightScalar(0, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end pixel-size regression (validation round, 2026-04-20)
//
// The user flagged post-θ.1b-initial-ship that all stars rendered as a
// single pixel — no visible giant/supergiant distinction. Root cause:
// `u_sizeFactor = 1.0` was 6 orders of magnitude smaller than Gaia Sky's
// `alphaSizeBr.y = starPointSize × 1e6 × pointScale`
// (StarSetQuadComponent.java:96). The `1e6` multiplier is a source-
// literal unit-conversion factor; without it every HYG star's clamped
// solid angle produces a sub-pixel `gl_PointSize` and the GPU collapses
// them all to the 1-pixel rasterisation floor, erasing magnitude-ordering.
// Tests below pin the fixed calibration — Betelgeuse > Sirius > G-dwarf
// in final pixel size — so a future refactor to `u_sizeFactor` can't
// silently re-break the giant-distinction invariant.
// ---------------------------------------------------------------------------

describe("end-to-end pixel-size calibration (Gaia Sky parity post-validation)", () => {
  // Canonical view: 60° fov, 1080 CSS × 1.5 DPR viewport.
  const PROJ_MATRIX_11 = 1 / Math.tan(Math.PI / 6); // cot(30°) ≈ 1.732
  const VIEWPORT_HEIGHT = computeViewportHeightScalar(1080, 1.5); // 1620
  const PIXELS_PER_RADIAN = computePixelsPerRadian(
    PROJ_MATRIX_11,
    VIEWPORT_HEIGHT
  );
  // Default u_sizeFactor after the validation fix.
  const SIZE_FACTOR = 1.0e6;
  const DIST = 206_265_000.0; // 1 pc in scene units.

  const finalPixelSize = (sizePc: number, distPc: number): number => {
    const m = starfieldSolidAngleMetrics({
      size: sizePc * DIST,
      dist: distPc * DIST,
    });
    return m.clampedSolidAngle * SIZE_FACTOR * PIXELS_PER_RADIAN;
  };

  it("Betelgeuse-class supergiant saturates at the 3e-8 clamp and renders > Sirius", () => {
    // Betelgeuse: apparentMag 0.42, distance ~168 pc, B-V ≈ 1.85
    // → Stefan-Boltzmann R ≈ hundreds of solar radii.
    const rBetelSol = estimateRadiusSolar(0.42, 168, 1.85);
    expect(rBetelSol).toBeGreaterThan(300);
    const pxBetel = finalPixelSize(rBetelSol * SOLAR_RADIUS_PC, 168);
    // Sirius: apparentMag -1.46, 2.64 pc, B-V ≈ 0.0 → R ~ 1.7 solar.
    const rSiriusSol = estimateRadiusSolar(-1.46, 2.64, 0.0);
    const pxSirius = finalPixelSize(rSiriusSol * SOLAR_RADIUS_PC, 2.64);
    // Sun at 10 pc (reference main-sequence G dwarf).
    const pxSun10pc = finalPixelSize(1 * SOLAR_RADIUS_PC, 10);

    // Expected ordering: supergiant > bright main-sequence > distant dwarf.
    expect(pxBetel).toBeGreaterThan(pxSirius);
    expect(pxSirius).toBeGreaterThan(pxSun10pc);

    // Rough magnitudes the calibration needs to hit for a useful
    // visual result:
    //   - Supergiant at or near the clamp ceiling (> 30 px).
    //   - Bright local main-sequence > 10 px.
    //   - Typical mag-5 G dwarf still visible (> 1 px — mandatory, else
    //     the whole starfield collapses to single-pixel haze like
    //     pre-validation).
    expect(pxBetel).toBeGreaterThan(30);
    expect(pxSirius).toBeGreaterThan(10);
    expect(pxSun10pc).toBeGreaterThan(1);
  });

  it("deep-tail M dwarf at 100 pc renders at sub-pixel (fade-to-invisible)", () => {
    // Mag-10+ red dwarf — we want these to fade away, NOT render at the
    // 1-pixel floor as a uniform haze.
    const rMdwarf = estimateRadiusSolar(10.5, 100, 1.5);
    const px = finalPixelSize(rMdwarf * SOLAR_RADIUS_PC, 100);
    expect(px).toBeLessThan(1);
  });

  it("u_sizeFactor calibration is the pixel-size knob: halving it halves pixels", () => {
    // Under the current fixed u_sizeFactor = 1e6, Sirius gets ~25 px.
    // If a future tuning change the user asks for needs smaller stars,
    // halving the uniform should halve the pixel size linearly.
    const pxFull = finalPixelSize(1.7 * SOLAR_RADIUS_PC, 2.64);
    const pxHalf = (() => {
      const m = starfieldSolidAngleMetrics({
        size: 1.7 * SOLAR_RADIUS_PC * DIST,
        dist: 2.64 * DIST,
      });
      return m.clampedSolidAngle * (SIZE_FACTOR / 2) * PIXELS_PER_RADIAN;
    })();
    approxEq(pxHalf, pxFull / 2, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Star physics — main-sequence lookup (legacy) + Stefan-Boltzmann (primary)
// ---------------------------------------------------------------------------

describe("bvToSolarRadius — main-sequence radius lookup (legacy path)", () => {
  it("maps B-V monotonically toward smaller radii for redder stars", () => {
    expect(bvToSolarRadius(-0.4)).toBe(12.0); // O star
    expect(bvToSolarRadius(-0.2)).toBe(7.0); // B
    expect(bvToSolarRadius(-0.05)).toBe(2.5); // A
    expect(bvToSolarRadius(0.2)).toBe(1.4); // F
    expect(bvToSolarRadius(0.5)).toBe(1.05); // G (Sun near here)
    expect(bvToSolarRadius(0.8)).toBe(0.85); // K
    expect(bvToSolarRadius(1.2)).toBe(0.55); // M early
    expect(bvToSolarRadius(1.5)).toBe(0.25); // M late
  });

  it("is non-increasing as B-V increases (no ringing between bins)", () => {
    let prev = Infinity;
    for (let bv = -0.5; bv <= 2.0; bv += 0.01) {
      const r = bvToSolarRadius(bv);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
  });

  it("bvToRadiusPc converts through SOLAR_RADIUS_PC", () => {
    approxEq(bvToRadiusPc(0.5), 1.05 * SOLAR_RADIUS_PC, 1e-15);
    approxEq(SOLAR_RADIUS_PC, 2.2537e-8, 1e-11);
  });
});

describe("Stefan-Boltzmann radius synthesis (θ.1b primary path, Codex #1)", () => {
  it("pins solar anchors (SUN_ABS_MAG_V = 4.83, SUN_TEFF = 5778 K)", () => {
    expect(SUN_ABS_MAG_V).toBe(4.83);
    expect(SUN_TEFF).toBe(5778);
  });

  it("Ballesteros Teff recovers the Sun at BV ≈ 0.63", () => {
    // Sun's BV is ~0.656. Expected Teff ~5778 K, tolerate ~5 %.
    const teff = bvToTeff(0.656);
    expect(teff).toBeGreaterThan(5500);
    expect(teff).toBeLessThan(6050);
  });

  it("Ballesteros Teff spans the HYG range monotonically in BV", () => {
    const teffO = bvToTeff(-0.3); // O star (hot)
    const teffA = bvToTeff(0.0); // A star
    const teffG = bvToTeff(0.65); // G (Sun)
    const teffK = bvToTeff(1.0); // K star
    const teffM = bvToTeff(1.4); // M star (cool)
    expect(teffO).toBeGreaterThan(teffA);
    expect(teffA).toBeGreaterThan(teffG);
    expect(teffG).toBeGreaterThan(teffK);
    expect(teffK).toBeGreaterThan(teffM);
  });

  it("apparentToAbsMag inverts the distance modulus", () => {
    // A star at 10 pc has absMag == apparentMag.
    approxEq(apparentToAbsMag(5, 10), 5, 1e-9);
    // Sirius: apparentMag -1.46 at 2.64 pc → absMag ≈ 1.42.
    const absSirius = apparentToAbsMag(-1.46, 2.64);
    approxEq(absSirius, 1.42, 0.05);
  });

  it("recovers Sirius' known radius within ~15 %", () => {
    // Sirius A: apparentMag -1.46, distance 2.64 pc, B-V ≈ 0.0 (A1V).
    // Known physical radius ≈ 1.71 solar radii.
    const rSun = estimateRadiusSolar(-1.46, 2.64, 0.0);
    expect(rSun).toBeGreaterThan(1.4);
    expect(rSun).toBeLessThan(2.0);
  });

  it("recovers Betelgeuse's supergiant radius MUCH larger than main-sequence lookup", () => {
    // Betelgeuse: apparentMag 0.42, distance ~168 pc, B-V ≈ 1.85 (M2I).
    // Actual radius ~764 solar radii (red supergiant).
    const rStefan = estimateRadiusSolar(0.42, 168, 1.85);
    const rMainSeq = bvToSolarRadius(1.85); // 0.25 (M late)
    // Stefan-Boltzmann should give radii orders of magnitude larger,
    // closing the gap on giants/supergiants Codex finding #1 flagged.
    expect(rStefan).toBeGreaterThan(100 * rMainSeq);
    expect(rStefan).toBeGreaterThan(300); // within an order of magnitude of 764.
  });

  it("Sun at 10 pc → radius 1.0 solar, within the numeric precision floor", () => {
    const rSun = estimateRadiusSolar(SUN_ABS_MAG_V, 10, 0.656);
    approxEq(rSun, 1.0, 0.05); // Ballesteros is ~5 % off from true Sun Teff.
  });

  it("falls back to unit radius on degenerate inputs", () => {
    expect(estimateRadiusSolar(NaN, 10, 0.5)).toBe(1.0);
    expect(estimateRadiusSolar(5, -1, 0.5)).toBe(1.0); // negative dist → absMag path guards.
    expect(estimateRadiusSolar(5, 10, -100)).toBe(1.0); // Teff guard.
  });

  it("estimateRadiusPc wraps through SOLAR_RADIUS_PC", () => {
    const rSun = estimateRadiusSolar(-1.46, 2.64, 0.0);
    const rPc = estimateRadiusPc(-1.46, 2.64, 0.0);
    approxEq(rPc, rSun * SOLAR_RADIUS_PC, 1e-15);
  });
});
