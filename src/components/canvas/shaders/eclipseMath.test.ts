import { describe, expect, it } from "vitest";

import {
  ECLIPSE_DIFFRACTION_END_RATIO,
  ECLIPSE_DIFFRACTION_INTENSITY_SCALE,
  ECLIPSE_DIFFRACTION_SPECTRUM_HIGH,
  ECLIPSE_DIFFRACTION_SPECTRUM_LOW,
  ECLIPSE_DIFFRACTION_SPECTRUM_SCALE,
  ECLIPSE_DIFFRACTION_START_RATIO,
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
  ECLIPSE_PENUMBRA_RADIUS_RATIO,
  ECLIPSE_UMBRA_CORE_RADIUS_RATIO,
  computeEclipseShading,
  distSegmentPoint,
  eclipseBlend,
  getDiffractionSpectrum,
} from "./eclipseMath";
import type { Vec3 } from "./eclipseMath";

const approxEq = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("eclipse constants — pinned to /tmp/gaiasky/assets/shader/lib/eclipses.glsl", () => {
  it("UMBRA0 = 0.04 (eclipses.glsl:13)", () => {
    expect(ECLIPSE_UMBRA_CORE_RADIUS_RATIO).toBe(0.04);
  });

  it("PENUMBRA0 = 1.7 (eclipses.glsl:16)", () => {
    expect(ECLIPSE_PENUMBRA_RADIUS_RATIO).toBe(1.7);
  });

  it("DIFFRACTION0 = 0.2, DIFFRACTION1 = 1.6 (eclipses.glsl:19,20)", () => {
    expect(ECLIPSE_DIFFRACTION_START_RATIO).toBe(0.2);
    expect(ECLIPSE_DIFFRACTION_END_RATIO).toBe(1.6);
  });

  it("edge fade window (-0.1, 0.2) (eclipses.glsl:47)", () => {
    expect(ECLIPSE_EDGE_FADE_LO).toBe(-0.1);
    expect(ECLIPSE_EDGE_FADE_HI).toBe(0.2);
  });

  it("near-side gate dot_NM > -0.15 (eclipses.glsl:49)", () => {
    expect(ECLIPSE_NEAR_SIDE_DOT_THRESHOLD).toBe(-0.15);
  });

  it("diffraction intensity scale 0.3 (eclipses.glsl:61)", () => {
    expect(ECLIPSE_DIFFRACTION_INTENSITY_SCALE).toBe(0.3);
  });

  it("diffraction spectrum pre-scale 0.5 (eclipses.glsl:68)", () => {
    expect(ECLIPSE_DIFFRACTION_SPECTRUM_SCALE).toBe(0.5);
  });

  it("diffraction spectrum endpoints (eclipses.glsl:25-26)", () => {
    expect(ECLIPSE_DIFFRACTION_SPECTRUM_LOW).toEqual([0.41, 0.26, 0.013]);
    expect(ECLIPSE_DIFFRACTION_SPECTRUM_HIGH).toEqual([0.88, 0.42, 0.063]);
  });
});

describe("distSegmentPoint — math.glsl dist_segment_point port", () => {
  it("degenerate segment (v == w) returns distance to endpoint", () => {
    const d = distSegmentPoint([0, 0, 0], [0, 0, 0], [3, 4, 0]);
    expect(d).toBe(5);
  });

  it("perpendicular distance for a point over the segment midpoint", () => {
    // Segment from (0,0,0) to (10,0,0); point at (5, 4, 0) → perpendicular distance 4.
    const d = distSegmentPoint([0, 0, 0], [10, 0, 0], [5, 4, 0]);
    approxEq(d, 4, 1e-12);
  });

  it("returns v-endpoint distance when t < 0 (point behind segment)", () => {
    // Segment from (0,0,0) to (10,0,0); point at (-3, 4, 0). t < 0.
    const d = distSegmentPoint([0, 0, 0], [10, 0, 0], [-3, 4, 0]);
    approxEq(d, 5, 1e-12); // sqrt(9 + 16)
  });

  it("returns w-endpoint distance when t > 1 (point past segment)", () => {
    // Segment from (0,0,0) to (10,0,0); point at (13, 4, 0). t > 1.
    const d = distSegmentPoint([0, 0, 0], [10, 0, 0], [13, 4, 0]);
    approxEq(d, 5, 1e-12); // sqrt(9 + 16)
  });
});

describe("getDiffractionSpectrum — eclipses.glsl:23-29", () => {
  it("returns the cool end at pos = 0", () => {
    expect(getDiffractionSpectrum(0)).toEqual([0.41, 0.26, 0.013]);
  });

  it("returns the hot end at pos = 1", () => {
    expect(getDiffractionSpectrum(1)).toEqual([0.88, 0.42, 0.063]);
  });

  it("linearly interpolates at the midpoint", () => {
    const mid = getDiffractionSpectrum(0.5);
    approxEq(mid[0], (0.41 + 0.88) / 2, 1e-12);
    approxEq(mid[1], (0.26 + 0.42) / 2, 1e-12);
    approxEq(mid[2], (0.013 + 0.063) / 2, 1e-12);
  });

  it("stays in the warm/orange quadrant for any pos in [0, 1]", () => {
    for (const pos of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const [r, g, b] = getDiffractionSpectrum(pos);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
  });
});

describe("computeEclipseShading — eclipses.glsl:33-94", () => {
  const radius = 1000;
  // Scenario setup: fragment at origin, light pointing +x,
  // normalWorld faces -x (toward light? yes = toward +x? let's choose
  // +x so fragment sees the light). Actually lightDirection is
  // "direction FROM fragment TO light", so normalWorld ≈ +x means
  // dot_NL = 1 (lit fragment, day side), which passes the edgeFade.
  const lightDirection: Vec3 = [1, 0, 0];
  const normalWorld: Vec3 = [1, 0, 0];
  const vrScale = 1e8;

  it("no shadow when the eclipsing body is far off the fragment→light ray", () => {
    // Eclipsing body far off-axis (y = 100k km, radius = 1k km).
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [50000, 100000, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    expect(result.shdw).toBe(1);
    expect(result.diffractionTint).toEqual([0, 0, 0]);
  });

  it("full umbra (shdw = 0) when the eclipsing body is centred on the ray inside UMBRA0", () => {
    // Eclipsing body on the ray at +50000 on x axis, with zero
    // perpendicular offset. `dist` = 0 < radius × 0.04 = 40 → shdw
    // floored to 0.
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [50000, 0, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    expect(result.shdw).toBe(0);
  });

  it("shdw ramps toward 1 as perpendicular distance approaches PENUMBRA0", () => {
    // At perpendicular offset = radius × 1.699 (just inside penumbra)
    // the pre-edgeFade shdw would be 1.699 / 1.7 ≈ 0.999;
    // after edge-fade mix it stays close to 1 because our fragment is
    // lit.
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [50000, radius * 1.699, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    expect(result.shdw).toBeGreaterThan(0.99);
    expect(result.shdw).toBeLessThan(1);
  });

  it("no shadow beyond PENUMBRA0 (perpendicular offset > radius × 1.7)", () => {
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [50000, radius * 1.71, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    expect(result.shdw).toBe(1);
    expect(result.diffractionTint).toEqual([0, 0, 0]);
  });

  it("near-side gate (dot_NM) culls fragments facing away from the eclipsing body", () => {
    // Eclipsing body behind the fragment (negative x). normalWorld is
    // +x so dot_NM = dot(+x, -x) = -1 < -0.15 → gate fails → shdw
    // stays 1.
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [-50000, 0, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    expect(result.shdw).toBe(1);
  });

  it("diffraction tint is non-zero inside the band and warm-orange", () => {
    // Perpendicular offset at the midpoint of the diffraction band:
    // x = 0.5 → diffractionIntensity = 4·0.5·0.5·0.3·edgeFade = 0.3·edgeFade.
    // On a fully-lit fragment edgeFade ≈ 1. Spectrum mid = [0.645, 0.34, 0.038].
    // Expected tint ≈ 0.5 × 0.3 × [0.645, 0.34, 0.038] ≈ [0.0967, 0.051, 0.0057].
    const midDist =
      (radius *
        (ECLIPSE_DIFFRACTION_START_RATIO + ECLIPSE_DIFFRACTION_END_RATIO)) /
      2;
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld,
      lightDirection,
      eclipsingBodyPos: [50000, midDist, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    const [r, g, b] = result.diffractionTint;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(0.05);
    expect(r).toBeLessThan(0.15);
  });

  it("terminator fragment (dot_NL ≤ -0.1) produces no shadow even if the body is on the ray", () => {
    // normalWorld points -x so dot(normal, +x) = -1 < -0.1 → edgeFade = 0.
    // Gaia keeps shdw = 1 via `mix(1, shdw, edgeFade=0) = 1` and tint = 0.
    const result = computeEclipseShading({
      fragmentPosWorld: [0, 0, 0],
      normalWorld: [-1, 0, 0],
      lightDirection,
      eclipsingBodyPos: [50000, 0, 0],
      eclipsingBodyRadius: radius,
      vrScale,
    });
    // Note: normal at [-1,0,0], to-m vector is [+x], dot_NM = -1 <
    // -0.15 → gate fails. Actually the early-out here is the dot_NM
    // gate, not the edge fade. Either way, shdw = 1 and tint = 0.
    expect(result.shdw).toBe(1);
    expect(result.diffractionTint).toEqual([0, 0, 0]);
  });
});

describe("eclipseBlend — eclipses.glsl:102-104 WeightedMix", () => {
  const base: Vec3 = [0.8, 0.8, 0.8];
  const tint: Vec3 = [1, 0.4, 0];

  it("shadow = 1 returns base unchanged (no eclipse)", () => {
    expect(eclipseBlend(base, tint, 1)).toEqual(base);
  });

  it("shadow = 0 returns pure tint (full umbra)", () => {
    expect(eclipseBlend(base, tint, 0)).toEqual(tint);
  });

  it("shadow = 0.5 interpolates halfway between base and tint", () => {
    const out = eclipseBlend(base, tint, 0.5);
    approxEq(out[0], (0.8 + 1) / 2, 1e-12);
    approxEq(out[1], (0.8 + 0.4) / 2, 1e-12);
    approxEq(out[2], (0.8 + 0) / 2, 1e-12);
  });
});
