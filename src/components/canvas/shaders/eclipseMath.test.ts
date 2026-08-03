import { describe, expect, it } from "vitest";

import {
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_LUNAR_REFRACTION_COLOR,
  ECLIPSE_LUNAR_REFRACTION_FLOOR,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
} from "./eclipseMath";
import {
  ECLIPSE_FRAGMENT_HELPERS,
  ECLIPSE_FRAGMENT_OUTPUT_PATCH,
  ECLIPSE_FRAGMENT_OUTPUT_PATCH_REFRACTION,
} from "./eclipseShaderPatch";

/**
 * W7 replaced the Gaia-mirror function suite (26 cases pinning a tuned
 * fixed-ratio cone) with the physical predicate in
 * `src/lib/eclipseGeometry.test.ts`. What this file still owns is the
 * constant registry: the literals the GLSL interpolates, and the shape of
 * the interpolation itself.
 */

describe("eclipse constant registry", () => {
  it("terminator fade window and near-side gate keep their screen-side values", () => {
    expect(ECLIPSE_EDGE_FADE_LO).toBe(-0.1);
    expect(ECLIPSE_EDGE_FADE_HI).toBe(0.2);
    expect(ECLIPSE_NEAR_SIDE_DOT_THRESHOLD).toBe(-0.15);
  });

  it("lunar refraction floor sits inside the Danjon L2–L3 band (10⁻³–10⁻⁴ of direct)", () => {
    expect(ECLIPSE_LUNAR_REFRACTION_FLOOR).toBeGreaterThanOrEqual(1e-4);
    expect(ECLIPSE_LUNAR_REFRACTION_FLOOR).toBeLessThanOrEqual(1e-3);
  });

  it("refraction colour is copper: monotonically warm (r > g > b)", () => {
    const [r, g, b] = ECLIPSE_LUNAR_REFRACTION_COLOR;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
  });
});

describe("GLSL interpolation shape", () => {
  it("the shadow helper interpolates the registry values, not re-typed literals", () => {
    expect(ECLIPSE_FRAGMENT_HELPERS).toContain(`${ECLIPSE_EDGE_FADE_LO}`);
    expect(ECLIPSE_FRAGMENT_HELPERS).toContain(`${ECLIPSE_EDGE_FADE_HI}`);
    expect(ECLIPSE_FRAGMENT_HELPERS).toContain(
      `${ECLIPSE_NEAR_SIDE_DOT_THRESHOLD}`
    );
  });

  it("every interpolated literal is a valid GLSL float (contains a decimal point)", () => {
    for (const value of [
      ECLIPSE_EDGE_FADE_LO,
      ECLIPSE_EDGE_FADE_HI,
      ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
      ECLIPSE_LUNAR_REFRACTION_FLOOR,
      ...ECLIPSE_LUNAR_REFRACTION_COLOR,
    ]) {
      expect(`${value}`).toMatch(/^-?\d+\.\d+$/);
    }
  });

  it("solar receivers shade neutrally; only the Earth-eclipser variant carries the copper floor", () => {
    expect(ECLIPSE_FRAGMENT_OUTPUT_PATCH).toContain("vec3(eclipseShadow)");
    expect(ECLIPSE_FRAGMENT_OUTPUT_PATCH).not.toContain(
      `${ECLIPSE_LUNAR_REFRACTION_COLOR[0]}`
    );
    expect(ECLIPSE_FRAGMENT_OUTPUT_PATCH_REFRACTION).toContain(
      `${ECLIPSE_LUNAR_REFRACTION_COLOR[0]}`
    );
    expect(ECLIPSE_FRAGMENT_OUTPUT_PATCH_REFRACTION).toContain(
      `${ECLIPSE_LUNAR_REFRACTION_FLOOR}`
    );
  });

  it("the ramp is floored by the derived annular minimum, and the divisor is guarded", () => {
    expect(ECLIPSE_FRAGMENT_HELPERS).toContain(
      "mix(uEclipsingMinShadow, 1.0, ramp)"
    );
    expect(ECLIPSE_FRAGMENT_HELPERS).toContain(
      "max(uEclipsingPenumbraRadius - uEclipsingUmbraRadius, 1e-9)"
    );
  });
});
