import { beforeAll, describe, expect, it } from "vitest";

import {
  EARTHSHINE_BODY_ID,
  EARTHSHINE_R_FULL,
  PLANETSHINE_EXCLUDED,
  PLANETSHINE_FLOOR,
  PLANETSHINE_R,
  isPlanetshineRecipient,
  resolveEarthshinePhaseFactor,
  resolvePlanetshineR,
  resolvePlanetshineRadianceScalar,
  resolvePlanetshineScalar,
} from "./planetshine";
import { initializeOrbitalEngine } from "../orbital/setup";

/** Inside every analytical provider's validity window. */
const TEST_DATE = new Date("2026-01-01T00:00:00Z");

describe("the R table", () => {
  it("gives Io 2.5x Europa's Jupiter-shine — the reason Europa alone would be cherry-picking", () => {
    expect(PLANETSHINE_R.io! / PLANETSHINE_R.europa!).toBeCloseTo(2.5, 12);
  });

  it("keeps both recipients above the exclusion floor, and Ganymede below it", () => {
    expect(PLANETSHINE_R.io!).toBeGreaterThanOrEqual(PLANETSHINE_FLOOR);
    expect(PLANETSHINE_R.europa!).toBeGreaterThanOrEqual(PLANETSHINE_FLOOR);
    expect(PLANETSHINE_EXCLUDED.ganymede!.r!).toBeLessThan(PLANETSHINE_FLOOR);
  });

  it("publishes a reason for every excluded body", () => {
    for (const [, entry] of Object.entries(PLANETSHINE_EXCLUDED)) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("recognises exactly the 3 recipients", () => {
    expect(isPlanetshineRecipient("io")).toBe(true);
    expect(isPlanetshineRecipient("europa")).toBe(true);
    expect(isPlanetshineRecipient("moon")).toBe(true);
    expect(isPlanetshineRecipient("ganymede")).toBe(false);
    expect(isPlanetshineRecipient("callisto")).toBe(false);
    expect(isPlanetshineRecipient("charon")).toBe(false);
    expect(isPlanetshineRecipient("earth")).toBe(false);
  });
});

describe("earthshine phase factor", () => {
  it("is zero at full Moon (Earth's own phase at new)", () => {
    expect(resolveEarthshinePhaseFactor(1)).toBe(0);
  });

  it("is maximal (1) at new Moon (Earth fully lit as seen from the Moon)", () => {
    expect(resolveEarthshinePhaseFactor(0)).toBe(1);
  });

  it("follows the Stellarium (1 - phase)^2 shape in between", () => {
    expect(resolveEarthshinePhaseFactor(0.5)).toBeCloseTo(0.25, 12);
    expect(resolveEarthshinePhaseFactor(0.75)).toBeCloseTo(0.0625, 12);
  });

  it("clamps rather than going negative or above 1 on an out-of-range input", () => {
    expect(resolveEarthshinePhaseFactor(-0.1)).toBe(1);
    expect(resolveEarthshinePhaseFactor(1.1)).toBe(0);
  });
});

describe("EARTHSHINE_R_FULL — derived, not asserted", () => {
  it("lands within 1% of the plan's ~1.0e-4 anchor", () => {
    // A × (r/d)^2 with A = 0.367 (Earth's V-band geometric albedo),
    // r = 6371 km, d = 384400 km — see this module's header for the
    // full derivation this constant literally evaluates.
    expect(EARTHSHINE_R_FULL).toBeCloseTo(1.008e-4, 6);
    expect(Math.abs(EARTHSHINE_R_FULL - 1.0e-4) / 1.0e-4).toBeLessThan(0.01);
  });
});

describe("resolvePlanetshineR", () => {
  it("returns the constant table value for Io/Europa regardless of moon phase", () => {
    expect(resolvePlanetshineR("io")).toBe(PLANETSHINE_R.io);
    expect(resolvePlanetshineR("europa")).toBe(PLANETSHINE_R.europa);
  });

  it("returns 0 for a non-recipient", () => {
    expect(resolvePlanetshineR("ganymede")).toBe(0);
    expect(resolvePlanetshineR("earth")).toBe(0);
  });

  it("defaults the Moon to full-phase (zero earthshine) when the fraction is omitted", () => {
    expect(resolvePlanetshineR(EARTHSHINE_BODY_ID)).toBe(0);
  });

  it("scales the Moon's R by the phase factor", () => {
    expect(resolvePlanetshineR(EARTHSHINE_BODY_ID, 0)).toBeCloseTo(
      EARTHSHINE_R_FULL,
      12
    );
    expect(resolvePlanetshineR(EARTHSHINE_BODY_ID, 1)).toBe(0);
  });
});

describe("resolvePlanetshineRadianceScalar — the pure magnitude law", () => {
  it("scales with the shine source's AU by inverse square, under 'real' (gain = 1)", () => {
    const at = (au: number) =>
      resolvePlanetshineRadianceScalar({
        bodyId: "io",
        parentHeliocentricDistanceAU: au,
        policy: "real",
        toneMapped: true,
      });

    // E(d) = (d0/d)^2, so doubling d quarters the fused scalar — same
    // property `solarIrradiance.test.ts` pins for the sun path.
    for (const d of [1, 5.2, 9.6]) {
      expect(at(2 * d)).toBeCloseTo(at(d) / 4, 12);
    }
  });

  it("preserves the Io/Europa 2.5x ratio through the full pipeline, at any shared parent AU", () => {
    for (const au of [1, 5.2, 30]) {
      const io = resolvePlanetshineRadianceScalar({
        bodyId: "io",
        parentHeliocentricDistanceAU: au,
        policy: "assisted",
        toneMapped: true,
      });
      const europa = resolvePlanetshineRadianceScalar({
        bodyId: "europa",
        parentHeliocentricDistanceAU: au,
        policy: "assisted",
        toneMapped: true,
      });
      expect(io / europa).toBeCloseTo(2.5, 10);
    }
  });

  it("is 0 at full Moon and positive (rising toward new Moon) for earthshine", () => {
    const at = (fraction: number) =>
      resolvePlanetshineRadianceScalar({
        bodyId: EARTHSHINE_BODY_ID,
        parentHeliocentricDistanceAU: 1,
        moonIlluminatedFraction: fraction,
        policy: "real",
        toneMapped: true,
      });

    expect(at(1)).toBe(0);
    expect(at(0.5)).toBeGreaterThan(0);
    expect(at(0)).toBeGreaterThan(at(0.5));
  });

  it("policy neutrality — 'real' is gain 1, exactly R x E, no compression", () => {
    // Mirrors solarIrradiance.test.ts's "is EXACTLY the irradiance under
    // 'real'" — no toBeCloseTo, because "close to 1x" is a weaker claim
    // than "does not touch it".
    const au = 5.2;
    const e = (1 / au) ** 2; // SOLAR_IRRADIANCE_ANCHOR_AU is 1
    const io = resolvePlanetshineRadianceScalar({
      bodyId: "io",
      parentHeliocentricDistanceAU: au,
      policy: "real",
      toneMapped: true,
    });
    expect(io).toBe(PLANETSHINE_R.io! * e);
  });

  it("returns 0 for a non-recipient regardless of inputs", () => {
    expect(
      resolvePlanetshineRadianceScalar({
        bodyId: "ganymede",
        parentHeliocentricDistanceAU: 5.2,
      })
    ).toBe(0);
  });
});

describe("resolvePlanetshineScalar — the ephemeris-consuming entry point", () => {
  beforeAll(() => {
    initializeOrbitalEngine();
  });

  it("is 0 for a non-recipient body", () => {
    expect(
      resolvePlanetshineScalar("earth", "sun", TEST_DATE, "real", true)
    ).toBe(0);
  });

  it("is 0 when parentId is missing", () => {
    expect(resolvePlanetshineScalar("io", undefined, TEST_DATE)).toBe(0);
  });

  it("is positive for Io/Europa given their real parent (Jupiter)", () => {
    const io = resolvePlanetshineScalar(
      "io",
      "jupiter",
      TEST_DATE,
      "real",
      true
    );
    const europa = resolvePlanetshineScalar(
      "europa",
      "jupiter",
      TEST_DATE,
      "real",
      true
    );
    expect(io).toBeGreaterThan(0);
    expect(europa).toBeGreaterThan(0);
    expect(io / europa).toBeCloseTo(2.5, 6);
  });

  it("computes a real, non-negative earthshine scalar for the Moon given Earth as parent", () => {
    const scalar = resolvePlanetshineScalar(
      "moon",
      "earth",
      TEST_DATE,
      "real",
      true
    );
    expect(Number.isFinite(scalar)).toBe(true);
    expect(scalar).toBeGreaterThanOrEqual(0);
  });
});
