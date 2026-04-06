import { describe, expect, it } from "vitest";
import { AstroPhysics } from "./astrophysics";

describe("AstroPhysics.parseScientificValue", () => {
  it("parses exact catalog masses with superscript exponents", () => {
    expect(AstroPhysics.parseScientificValue("2.59 × 10²⁰ kg")).toBe(2.59e20);
  });

  it("parses approximate values with estimates and mixed exponent glyphs", () => {
    expect(
      AstroPhysics.parseScientificValue("~3.3 × 10¹8 kg (estimated)")
    ).toBe(3.3e18);
    expect(
      AstroPhysics.parseScientificValue("~0.13 m/s² (estimated)")
    ).toBeCloseTo(0.13);
  });

  it("returns NaN when no numeric payload exists", () => {
    expect(AstroPhysics.parseScientificValue("Not detected")).toBeNaN();
  });
});

describe("AstroPhysics telemetry guards", () => {
  it("returns NaN for orbital velocity when parent mass is invalid", () => {
    expect(
      AstroPhysics.calculateOrbitalVelocity(
        { a: 39.4, e: 0.22, i: 20.6, O: 0, w: 0, M0: 0, n: 0.004 },
        39.4,
        Number.NaN
      )
    ).toBeNaN();
  });

  it("returns NaN for escape velocity when mass is invalid", () => {
    expect(AstroPhysics.calculateEscapeVelocity(Number.NaN, 85)).toBeNaN();
  });
});
