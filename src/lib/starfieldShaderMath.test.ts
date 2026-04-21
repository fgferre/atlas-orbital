import { describe, expect, it } from "vitest";

import {
  computePixelsPerRadian,
  computeViewportHeightScalar,
  CORE_SMOOTHSTEP_EDGE_HIGH,
  CORE_SMOOTHSTEP_EDGE_LOW,
  GAIA_STAR_COLOR_SATURATION,
  gaiaBvToRgb,
  LEN0,
  MAX_QUAD_SOLID_ANGLE_LITERAL,
  saturateStarRgb,
  starfieldFragmentRgba,
  U_BRIGHTNESS_POWER_DEFAULT,
  U_BRIGHTNESS_POWER_RANGE,
  U_MIN_QUAD_SOLID_ANGLE,
  U_OPACITY_LIMITS,
  U_SOLID_ANGLE_MAP,
  U_STAR_BRIGHTNESS_DEFAULT,
  starfieldCoreKernel,
  starfieldSolidAngleMetrics,
} from "./starfieldShaderMath";
import {
  absoluteMagnitudeToPseudoSize,
  apparentToAbsMag,
  GAIA_PSEUDO_SIZE_CEILING_PC,
  GAIA_PSEUDO_SIZE_COEFFICIENT_PC,
  pseudoSizeFromApparentMag,
  STAR_SIZE_FACTOR,
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

describe("gaiaBvToRgb — Gaia Sky ColorUtils.BVtoRGB port", () => {
  it("maps hot stars toward blue-white and cool stars toward orange-red", () => {
    const sirius = gaiaBvToRgb(0.01);
    const capella = gaiaBvToRgb(0.8);
    const betelgeuse = gaiaBvToRgb(1.5);

    expect(sirius[2]).toBeGreaterThan(sirius[0]);
    expect(sirius[2]).toBeGreaterThan(sirius[1]);
    expect(capella[0]).toBeGreaterThan(capella[2]);
    expect(betelgeuse[0]).toBe(1);
    expect(betelgeuse[1]).toBeLessThan(capella[1]);
    expect(betelgeuse[2]).toBeLessThan(capella[2]);
  });

  it("pins representative Gaia ColorUtils numeric outputs", () => {
    const vega = gaiaBvToRgb(0.0);
    const sunLike = gaiaBvToRgb(0.65);
    const redGiant = gaiaBvToRgb(1.5);

    approxEq(vega[0], 0.734, 0.005);
    approxEq(vega[1], 0.8, 0.005);
    approxEq(vega[2], 1.0, 0.005);
    approxEq(sunLike[0], 1.0, 0.005);
    approxEq(sunLike[1], 0.923, 0.005);
    approxEq(sunLike[2], 0.885, 0.005);
    approxEq(redGiant[0], 1.0, 0.005);
    approxEq(redGiant[1], 0.748, 0.005);
    approxEq(redGiant[2], 0.48, 0.005);
  });

  it("applies Gaia Sky's default HSV saturation lift", () => {
    const base = gaiaBvToRgb(0.65);
    const saturated = saturateStarRgb(base);

    expect(GAIA_STAR_COLOR_SATURATION).toBe(0.16);
    expect(saturated[0]).toBeCloseTo(base[0], 6);
    expect(saturated[1]).toBeLessThan(base[1]);
    expect(saturated[2]).toBeLessThan(base[2]);
  });
});

describe("starfieldFragmentRgba — Gaia Sky fragment saturate composite", () => {
  it("clamps the additive core output to LDR like star.group.quad.fragment.glsl", () => {
    expect(starfieldFragmentRgba([0.8, 0.7, 0.6], 1, 1, 1)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("keeps sub-core halo output premultiplied by alpha and profile", () => {
    const rgba = starfieldFragmentRgba([0.5, 0.25, 0.125], 0.5, 0, 0.5);
    approxEq(rgba[0], 0.125, 1e-9);
    approxEq(rgba[1], 0.0625, 1e-9);
    approxEq(rgba[2], 0.03125, 1e-9);
    approxEq(rgba[3], 0.25, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Solid-angle metrics (θ.1b vertex port)
// ---------------------------------------------------------------------------

describe("starfieldSolidAngleMetrics — Gaia Sky vertex solid-angle port", () => {
  it("pins the source-authoritative default uniforms", () => {
    // Source: StarSetQuadComponent.java + star.group.quad.vertex.glsl.
    expect(U_SOLID_ANGLE_MAP[0]).toBe(1e-10);
    expect(U_SOLID_ANGLE_MAP[1]).toBe(2e-9);
    // config.yaml default (no user override): opacityLimits = [0.0, 1.0].
    expect(U_OPACITY_LIMITS[0]).toBe(0.0);
    expect(U_OPACITY_LIMITS[1]).toBe(1.0);
    expect(U_BRIGHTNESS_POWER_DEFAULT).toBe(1.0);
    expect(U_BRIGHTNESS_POWER_RANGE[0]).toBe(0.9);
    expect(U_BRIGHTNESS_POWER_RANGE[1]).toBe(1.1);
    approxEq(U_STAR_BRIGHTNESS_DEFAULT, 0.9578947368, 1e-10);
    expect(MAX_QUAD_SOLID_ANGLE_LITERAL).toBe(3.0e-8);
  });

  it("rawSolidAngle is size/dist (dimensionless)", () => {
    // Pseudo-size sample: Sirius-like (absMag +1.44 → size ≈ 0.077 pc),
    // at 2.64 pc. size/dist ≈ 2.93e-2 rad pre-shader scaling.
    const sizePc = absoluteMagnitudeToPseudoSize(1.44);
    const distPc = 2.64;
    const m = starfieldSolidAngleMetrics({
      size: sizePc * DISTANCE_SCALE,
      dist: distPc * DISTANCE_SCALE,
    });
    approxEq(m.rawSolidAngle, sizePc / distPc, 1e-12);
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
    // Very small solidAngle: saturates to opacityLimits[0] (default 0).
    const dim = starfieldSolidAngleMetrics({ size: 1, dist: 1e20 });
    approxEq(dim.opacity, U_OPACITY_LIMITS[0], 1e-9);
    // Very large solidAngle: saturates to opacityLimits[1] (default 1).
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
    // Pick a sample well above the minQuad floor (1.8e-9) so the three
    // power endpoints produce distinct clamped values instead of all
    // getting pinned to the floor.
    const sample = { size: 1e-8 * 206_265_000, dist: 206_265_000 };
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
    // At very far distance opacity → opacityLimits[0] = 0.0 (Gaia Sky
    // default). Faint stars naturally fade to full-zero alpha without
    // needing a `< 1e-3` guard. Confirm this default behaviour: the
    // deep tail is outright invisible.
    const m = starfieldSolidAngleMetrics({
      size: 1e-14,
      dist: LEN0 * 1e4,
    });
    expect(m.alpha).toBe(0);
  });

  it("preserves magnitude ordering across typical HYG distances", () => {
    // Three representative stars at the typical HYG range; solidAngle
    // should be monotonic in the expected direction (larger pseudo-size
    // or smaller distance → larger solidAngle).
    //
    // Use Gaia-Sky pseudo-size (not physical radius) so the ordering
    // test reflects the actual vertex-shader semantics.
    const sirius = starfieldSolidAngleMetrics({
      size: pseudoSizeFromApparentMag(-1.46, 2.64) * DISTANCE_SCALE,
      dist: 2.64 * DISTANCE_SCALE,
    });
    const typical = starfieldSolidAngleMetrics({
      size: pseudoSizeFromApparentMag(3.0, 20) * DISTANCE_SCALE,
      dist: 20 * DISTANCE_SCALE,
    });
    const faint = starfieldSolidAngleMetrics({
      size: pseudoSizeFromApparentMag(7.0, 200) * DISTANCE_SCALE,
      dist: 200 * DISTANCE_SCALE,
    });
    expect(sirius.rawSolidAngle).toBeGreaterThan(typical.rawSolidAngle);
    expect(typical.rawSolidAngle).toBeGreaterThan(faint.rawSolidAngle);
  });
});

// ---------------------------------------------------------------------------
// Pixel-space projection helpers (θ.1b billboard path)
// ---------------------------------------------------------------------------

describe("computePixelsPerRadian — billboard projection parity", () => {
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

describe("computeViewportHeightScalar — minQuadSolidAngle DPR feed", () => {
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
// End-to-end pixel-size regression (Gaia Sky 1:1, post-pseudo-size fix
// 2026-04-21)
//
// **Key invariant the earlier Stefan-Boltzmann ship violated:** with
// Gaia Sky pseudo-size (`sqrt(10^(-0.4·absMag)) × 0.15 pc`), bright hot
// dwarfs like Sirius SATURATE the `3e-8` solid-angle clamp BEFORE cool
// red supergiants like Betelgeuse. Both reach the ceiling (so on-
// screen they end up the same size after clamp), but the PRE-clamp
// ordering is Sirius > Betel — the opposite of Stefan-Boltzmann
// physical radius. This section pins that semantic so a future
// "fix" doesn't silently reintroduce Betelgeuse > Sirius.
// ---------------------------------------------------------------------------

describe("end-to-end pixel-size calibration (Gaia Sky pseudo-size parity)", () => {
  // Canonical view: 60° fov, 1080 CSS × 1.5 DPR viewport.
  const PROJ_MATRIX_11 = 1 / Math.tan(Math.PI / 6); // cot(30°) ≈ 1.732
  const VIEWPORT_HEIGHT = computeViewportHeightScalar(1080, 1.5); // 1620
  const PIXELS_PER_RADIAN = computePixelsPerRadian(
    PROJ_MATRIX_11,
    VIEWPORT_HEIGHT
  );
  // Gaia Sky default u_sizeFactor: starPointSize (1.2) × 1e6 × pointScale (1.0)
  // = 1.2e6 (StarSetQuadComponent.java:96).
  const SIZE_FACTOR = 1.2e6;
  const DIST = 206_265_000.0; // 1 pc in scene units.

  // Compose the full Starfield.tsx pipeline:
  //   1. pseudoSizeFromApparentMag(apparentMag, distPc) → pc
  //   2. × DISTANCE_SCALE → scene units
  //   3. × STAR_SIZE_FACTOR → final a_size value
  //   4. solidAngleMetrics clamps → clampedSolidAngle
  //   5. × u_sizeFactor × pixelsPerRadian → pixel size
  const pixelSize = (apparentMag: number, distPc: number): number => {
    const pseudoPc = pseudoSizeFromApparentMag(apparentMag, distPc);
    const aSize = pseudoPc * DIST * STAR_SIZE_FACTOR;
    const m = starfieldSolidAngleMetrics({ size: aSize, dist: distPc * DIST });
    return m.clampedSolidAngle * SIZE_FACTOR * PIXELS_PER_RADIAN;
  };

  it("Sirius renders LARGER than Betelgeuse at the typical view (inverts Stefan-Boltzmann ordering)", () => {
    // Sirius: apparentMag -1.46, 2.64 pc → absMag ≈ +1.44 → pseudo-size
    // ≈ 0.0775 pc → raw solidAngle ≈ 3.86e-8 rad → clamps at 3e-8
    // ceiling → ~50.5 px under the canonical view.
    const pxSirius = pixelSize(-1.46, 2.64);
    // Betelgeuse: apparentMag 0.42, 168 pc → absMag ≈ −5.71 → pseudo-size
    // ≈ 2.083 pc → raw solidAngle ≈ 1.63e-8 rad → does NOT clamp →
    // ~27.4 px under the canonical view.
    const pxBetel = pixelSize(0.42, 168);

    // THE correctness anchor (reversal of the pre-fix Stefan-Boltzmann
    // ship that had Betel ≈ 3× Sirius): Sirius must be LARGER.
    expect(pxSirius).toBeGreaterThan(pxBetel);
    // Both bright and clearly visible.
    expect(pxSirius).toBeGreaterThan(40);
    expect(pxBetel).toBeGreaterThan(15);
    // Ratio in a sane range — Sirius outsizes Betel by ~1.8× (not 3×
    // the other way) under the pseudo-size semantics.
    expect(pxSirius / pxBetel).toBeGreaterThan(1.3);
    expect(pxSirius / pxBetel).toBeLessThan(2.5);
  });

  it("PRE-clamp ordering: Sirius > Betelgeuse in raw pseudo-solidAngle", () => {
    // Cross-check before clamp to verify the pseudo-size formula itself
    // produces the Sirius > Betel ordering that Gaia Sky has. This is
    // what the Opus audit 2026-04-21 pinned as the correctness anchor.
    const pseudoSirius = pseudoSizeFromApparentMag(-1.46, 2.64);
    const rawSiriusSA = pseudoSirius / 2.64;
    const pseudoBetel = pseudoSizeFromApparentMag(0.42, 168);
    const rawBetelSA = pseudoBetel / 168;
    expect(rawSiriusSA).toBeGreaterThan(rawBetelSA);
  });

  it("typical mag-5 star at 20 pc renders above the 1px floor (visible)", () => {
    // Ensures the opacity band and clamp math don't collapse the
    // sparse main-sequence tail to sub-pixel. The user flagged pre-
    // validation "all stars 1 pixel" — this is the sentinel.
    const pxTypical = pixelSize(5.0, 20);
    expect(pxTypical).toBeGreaterThan(1);
  });

  it("deep-tail faint star (mag 12, 500 pc) stabilises at minQuad floor with alpha = 0", () => {
    // Stars dim + far enough that rawSolidAngle sits below the
    // opacityMap lower bound (1e-10). Shader path:
    //   - clampedSolidAngle = U_MIN_QUAD_SOLID_ANGLE (resolution-adaptive floor)
    //   - opacity = opacityLimits[0] = 0 (Gaia Sky default)
    //   - alpha = 0 → fragment discard → invisible
    const apparentMag = 12;
    const distPc = 500;
    const pseudoPc = pseudoSizeFromApparentMag(apparentMag, distPc);
    const aSize = pseudoPc * DIST * STAR_SIZE_FACTOR;
    const m = starfieldSolidAngleMetrics({
      size: aSize,
      dist: distPc * DIST,
    });
    expect(m.opacity).toBe(U_OPACITY_LIMITS[0]);
    expect(m.alpha).toBe(0);
  });

  it("u_sizeFactor is the pixel-size knob: halving it halves pixels linearly", () => {
    // Under the fixed u_sizeFactor = 1.2e6 default, halving the uniform
    // should halve the pixel size linearly (for a star not floored /
    // ceilinged by the solidAngle clamps).
    const sample = pseudoSizeFromApparentMag(5.0, 20);
    const aSize = sample * DIST * STAR_SIZE_FACTOR;
    const m = starfieldSolidAngleMetrics({ size: aSize, dist: 20 * DIST });
    const pxFull = m.clampedSolidAngle * SIZE_FACTOR * PIXELS_PER_RADIAN;
    const pxHalf = m.clampedSolidAngle * (SIZE_FACTOR / 2) * PIXELS_PER_RADIAN;
    approxEq(pxHalf, pxFull / 2, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Star physics — Gaia Sky pseudo-size port (θ.1b, 2026-04-21)
// ---------------------------------------------------------------------------

describe("absoluteMagnitudeToPseudoSize — Gaia Sky AstroUtils port", () => {
  it("pins the pseudo-size coefficient constant 0.15", () => {
    expect(GAIA_PSEUDO_SIZE_COEFFICIENT_PC).toBe(0.15);
  });

  it("pins STAR_SIZE_FACTOR to Gaia Sky Constants.java:51 literal", () => {
    expect(STAR_SIZE_FACTOR).toBe(1.31526e-6);
  });

  it("matches the Java formula at absMag = 0 (pseudoL = 1)", () => {
    // pseudoL = 10^(-0.4·0) = 1.0 → size = sqrt(1)·0.15 = 0.15 pc.
    approxEq(absoluteMagnitudeToPseudoSize(0), 0.15, 1e-12);
  });

  it("Sun (absMag +4.83) → sqrt(10^(-1.932))·0.15 ≈ 0.0162 pc", () => {
    // Verifies the direction: Sun at absMag +4.83 is FAINTER than the
    // absMag=0 reference, so pseudo-size should be SMALLER than 0.15 pc.
    const sun = absoluteMagnitudeToPseudoSize(4.83);
    const expected = Math.sqrt(Math.pow(10, -1.932)) * 0.15;
    approxEq(sun, expected, 1e-6);
    expect(sun).toBeLessThan(absoluteMagnitudeToPseudoSize(0));
  });

  it("Betelgeuse (absMag ≈ −5.71) → brighter → LARGER pseudo-size than Sirius", () => {
    // absMag -5.71 → pseudoL = 10^2.284 ≈ 192.5 → sqrt ≈ 13.88
    //   → size ≈ 2.08 pc.
    const betel = absoluteMagnitudeToPseudoSize(-5.71);
    // absMag +1.44 (Sirius) → pseudoL ≈ 0.265 → sqrt ≈ 0.515
    //   → size ≈ 0.0772 pc.
    const sirius = absoluteMagnitudeToPseudoSize(1.44);
    approxEq(betel, 2.083, 0.01);
    approxEq(sirius, 0.0772, 0.001);
    // In absolute-magnitude space, Betelgeuse is LARGER pseudo-size.
    expect(betel).toBeGreaterThan(sirius);
  });

  it("the distance divide inverts the ordering: at typical HYG distances, Sirius > Betelgeuse in solidAngle", () => {
    // This is the whole point — pseudo-size grows with luminosity, but
    // the shader's `solidAngle = a_size / dist` makes closer bright
    // stars outshine distant supergiants.
    const sirius = absoluteMagnitudeToPseudoSize(1.44) / 2.64; // 2.64 pc
    const betel = absoluteMagnitudeToPseudoSize(-5.71) / 168; // 168 pc
    expect(sirius).toBeGreaterThan(betel);
  });

  it("apparentToAbsMag inverts the distance modulus", () => {
    // A star at 10 pc has absMag == apparentMag.
    approxEq(apparentToAbsMag(5, 10), 5, 1e-9);
    // Sirius: apparentMag -1.46 at 2.64 pc → absMag ≈ 1.44.
    const absSirius = apparentToAbsMag(-1.46, 2.64);
    approxEq(absSirius, 1.44, 0.05);
    // Betelgeuse: apparentMag 0.42 at 168 pc → absMag ≈ -5.71.
    const absBetel = apparentToAbsMag(0.42, 168);
    approxEq(absBetel, -5.71, 0.05);
  });

  it("pseudoSizeFromApparentMag = absoluteMagnitudeToPseudoSize ∘ apparentToAbsMag", () => {
    const apparentMag = -1.46;
    const distPc = 2.64;
    const viaCombined = pseudoSizeFromApparentMag(apparentMag, distPc);
    const viaExplicit = absoluteMagnitudeToPseudoSize(
      apparentToAbsMag(apparentMag, distPc)
    );
    approxEq(viaCombined, viaExplicit, 1e-15);
  });

  it("falls back to 0 on non-finite absolute magnitude", () => {
    expect(absoluteMagnitudeToPseudoSize(NaN)).toBe(0);
    expect(absoluteMagnitudeToPseudoSize(Infinity)).toBe(0);
    expect(absoluteMagnitudeToPseudoSize(-Infinity)).toBe(0);
  });

  it("clamps at the Gaia Sky ceiling (1e10 internal u ≈ 324.08 pc)", () => {
    // Gaia Sky caps at 1e10 internal units — in parsec-space that's
    // ≈324.08 pc (Codex 2026-04-21 finding: the earlier ship clamped
    // at 1e10 *pc* which is ~8 orders of magnitude too high). Needs
    // absMag < ~-17 to fire (brighter than any real HYG star), but
    // pinned for strict 1:1 parity.
    // Tolerance ~0.01 pc accounts for PC_TO_M float-multiplication
    // precision (underlying constant 1e10 / (3.0857e16 × 1e-9)).
    approxEq(GAIA_PSEUDO_SIZE_CEILING_PC, 324.08, 0.1);
    expect(absoluteMagnitudeToPseudoSize(-60)).toBe(
      GAIA_PSEUDO_SIZE_CEILING_PC
    );
    // Normal-brightness stars stay well below the ceiling.
    expect(absoluteMagnitudeToPseudoSize(-5.71)).toBeLessThan(
      GAIA_PSEUDO_SIZE_CEILING_PC
    );
  });
});
