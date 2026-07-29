import { describe, expect, it } from "vitest";

import {
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_LUNAR_REFRACTION_TINT,
  ECLIPSE_LUNAR_UMBRA_FLOOR,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
} from "./eclipseMath";

/**
 * W7 deleted the pure-TypeScript mirror of the eclipse shading algorithm
 * (`computeEclipseShading`, `eclipseBlend`, `distSegmentPoint`,
 * `getDiffractionSpectrum`) along with its 26 test cases — the algorithm
 * itself moved to `../../../lib/eclipseGeometry.ts`, which IS consumed by
 * production code and IS the thing under test now
 * (`eclipseGeometry.test.ts`). What remains here are the handful of
 * literals the GLSL patch still interpolates directly.
 */
describe("eclipse constants — pinned literals the GLSL patch interpolates", () => {
  it("edge fade window (-0.1, 0.2) (eclipses.glsl:47)", () => {
    expect(ECLIPSE_EDGE_FADE_LO).toBe(-0.1);
    expect(ECLIPSE_EDGE_FADE_HI).toBe(0.2);
  });

  it("near-side gate dot_NM > -0.15 (eclipses.glsl:49)", () => {
    expect(ECLIPSE_NEAR_SIDE_DOT_THRESHOLD).toBe(-0.15);
  });

  it("lunar umbral floor is a small positive fraction of direct light, not zero and not saturating", () => {
    expect(ECLIPSE_LUNAR_UMBRA_FLOOR).toBeGreaterThan(0);
    expect(ECLIPSE_LUNAR_UMBRA_FLOOR).toBeLessThan(0.01);
  });

  it("lunar refraction tint stays in the warm/orange quadrant (r > g > b)", () => {
    const [r, g, b] = ECLIPSE_LUNAR_REFRACTION_TINT;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});
