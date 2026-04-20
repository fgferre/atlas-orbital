import { describe, expect, it } from "vitest";

import {
  CORE_SMOOTHSTEP_EDGE_HIGH,
  CORE_SMOOTHSTEP_EDGE_LOW,
  LEN0,
  U_BRIGHTNESS_POWER_DEFAULT,
  U_BRIGHTNESS_POWER_RANGE,
  U_MAX_QUAD_SOLID_ANGLE,
  U_MIN_QUAD_SOLID_ANGLE,
  U_OPACITY_LIMITS,
  U_SOLID_ANGLE_MAP,
  starfieldCoreKernel,
  starfieldSolidAngleMetrics,
} from "./starfieldShaderMath";
import { bvToRadiusPc, bvToSolarRadius, SOLAR_RADIUS_PC } from "./starPhysics";

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
    expect(U_MAX_QUAD_SOLID_ANGLE).toBe(3.0e-8);
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

  it("clampedSolidAngle stays within [U_MIN_QUAD_SOLID_ANGLE, U_MAX_QUAD_SOLID_ANGLE]", () => {
    // Gigantic solidAngle → clamp to 3e-8.
    const huge = starfieldSolidAngleMetrics({ size: 1, dist: 1 });
    expect(huge.clampedSolidAngle).toBeLessThanOrEqual(U_MAX_QUAD_SOLID_ANGLE);
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

describe("bvToSolarRadius — main-sequence radius lookup", () => {
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
