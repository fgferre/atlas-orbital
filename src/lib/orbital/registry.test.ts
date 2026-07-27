import { describe, it, expect } from "vitest";
import {
  getOrbitalMetadata,
  hasAnalyticalEphemeris,
  getBodiesByModel,
  isWithinValidityRange,
  getAllRegisteredBodies,
  ANALYTICAL_EPHEMERIS_BODIES,
  KEPLER_ONLY_BODIES,
} from "./registry";
import type { AnalyticalModel } from "./types";

describe("Orbital Registry", () => {
  describe("getOrbitalMetadata", () => {
    it("should return metadata for registered bodies", () => {
      const mercury = getOrbitalMetadata("mercury");
      expect(mercury).not.toBeNull();
      expect(mercury?.primaryModel).toBe("VSOP87D");
      expect(mercury?.primaryProvider).toBe("ephem");
      expect(mercury?.fallbackProvider).toBe("kepler");
    });

    it("should return metadata for Kepler-only bodies", () => {
      const eris = getOrbitalMetadata("eris");
      expect(eris).not.toBeNull();
      expect(eris?.primaryModel).toBe("Kepler");
    });

    it("should return null for unregistered bodies", () => {
      const unknown = getOrbitalMetadata("unknown-body");
      expect(unknown).toBeNull();
    });
  });

  describe("hasAnalyticalEphemeris", () => {
    it("should return true for VSOP87D inner planets", () => {
      expect(hasAnalyticalEphemeris("mercury")).toBe(true);
      expect(hasAnalyticalEphemeris("venus")).toBe(true);
      expect(hasAnalyticalEphemeris("earth")).toBe(true);
      expect(hasAnalyticalEphemeris("mars")).toBe(true);
    });

    it("should return true for VSOP87D outer planets and Pluto", () => {
      expect(hasAnalyticalEphemeris("jupiter")).toBe(true);
      expect(hasAnalyticalEphemeris("saturn")).toBe(true);
      expect(hasAnalyticalEphemeris("uranus")).toBe(true);
      expect(hasAnalyticalEphemeris("neptune")).toBe(true);
      expect(hasAnalyticalEphemeris("pluto")).toBe(true);
    });

    it("should return true for ELP/MPP02 (Moon)", () => {
      expect(hasAnalyticalEphemeris("moon")).toBe(true);
    });

    it("should return false for Kepler-only bodies", () => {
      expect(hasAnalyticalEphemeris("eris")).toBe(false);
      expect(hasAnalyticalEphemeris("vanth")).toBe(false);
      expect(hasAnalyticalEphemeris("eris")).toBe(false);
    });

    it("should return false for unregistered bodies", () => {
      expect(hasAnalyticalEphemeris("unknown")).toBe(false);
    });
  });

  describe("getBodiesByModel", () => {
    it("should return all VSOP87D bodies (inner + outer planets)", () => {
      const vsopBodies = getBodiesByModel("VSOP87D");
      expect(vsopBodies).toContain("mercury");
      expect(vsopBodies).toContain("venus");
      expect(vsopBodies).toContain("earth");
      expect(vsopBodies).toContain("mars");
      expect(vsopBodies).toContain("jupiter");
      expect(vsopBodies).toContain("saturn");
      expect(vsopBodies).toContain("uranus");
      expect(vsopBodies).toContain("neptune");
    });

    it("should isolate Pluto on its own Meeus branch", () => {
      const plutoBodies = getBodiesByModel("Pluto-Meeus");
      expect(plutoBodies).toEqual(["pluto"]);
    });

    it("should return an array (possibly empty) for unsupported model labels", () => {
      const empty = getBodiesByModel("Kepler" as AnalyticalModel);
      expect(Array.isArray(empty)).toBe(true);
    });
  });

  describe("isWithinValidityRange", () => {
    it("should return true for dates within asteroid range (2000-2050)", () => {
      const testDate = new Date("2020-06-15");
      expect(isWithinValidityRange("ceres", testDate)).toBe(true);
      expect(isWithinValidityRange("pallas", testDate)).toBe(true);
      expect(isWithinValidityRange("vesta", testDate)).toBe(true);
    });

    it("should return false for dates outside the asteroid validity range", () => {
      const before1900 = new Date("1850-01-01");
      const after2050 = new Date("2100-01-01");

      expect(isWithinValidityRange("ceres", before1900)).toBe(false);
      expect(isWithinValidityRange("ceres", after2050)).toBe(false);
    });

    it("should gate analytical satellites to the 2020-2030 window", () => {
      // The satellite element blocks are osculating elements frozen at
      // 2025-01-01 and advanced by a two-body step, so they must advertise a
      // window rather than silently claiming validity forever.
      const inWindow = new Date("2025-06-15");
      const beforeWindow = new Date("2019-06-15");
      const afterWindow = new Date("2031-06-15");

      for (const bodyId of ["phobos", "io", "mimas", "miranda"]) {
        expect(isWithinValidityRange(bodyId, inWindow)).toBe(true);
        expect(isWithinValidityRange(bodyId, beforeWindow)).toBe(false);
        expect(isWithinValidityRange(bodyId, afterWindow)).toBe(false);
      }
    });

    it("should return true for bodies without validity restrictions", () => {
      const anyDate = new Date("2020-01-01");
      expect(isWithinValidityRange("mercury", anyDate)).toBe(true);
      expect(isWithinValidityRange("jupiter", anyDate)).toBe(true);
      expect(isWithinValidityRange("moon", anyDate)).toBe(true);
    });

    it("should return true for unregistered bodies", () => {
      const anyDate = new Date("2020-01-01");
      expect(isWithinValidityRange("unknown", anyDate)).toBe(true);
    });
  });

  describe("getAllRegisteredBodies", () => {
    it("should return array of body IDs", () => {
      const bodies = getAllRegisteredBodies();
      expect(Array.isArray(bodies)).toBe(true);
      expect(bodies.length).toBeGreaterThan(0);
    });

    it("should include major planets", () => {
      const bodies = getAllRegisteredBodies();
      expect(bodies).toContain("mercury");
      expect(bodies).toContain("venus");
      expect(bodies).toContain("earth");
      expect(bodies).toContain("mars");
      expect(bodies).toContain("jupiter");
      expect(bodies).toContain("saturn");
      expect(bodies).toContain("uranus");
      expect(bodies).toContain("neptune");
    });

    it("should include moons", () => {
      const bodies = getAllRegisteredBodies();
      expect(bodies).toContain("moon");
      expect(bodies).toContain("io");
      expect(bodies).toContain("europa");
      expect(bodies).toContain("titan");
    });
  });

  describe("ANALYTICAL_EPHEMERIS_BODIES", () => {
    it("should include planets with analytical models", () => {
      expect(ANALYTICAL_EPHEMERIS_BODIES).toContain("mercury");
      expect(ANALYTICAL_EPHEMERIS_BODIES).toContain("jupiter");
      expect(ANALYTICAL_EPHEMERIS_BODIES).toContain("moon");
    });

    it("should not include Kepler-only bodies", () => {
      expect(ANALYTICAL_EPHEMERIS_BODIES).not.toContain("eris");
      expect(ANALYTICAL_EPHEMERIS_BODIES).not.toContain("vanth");
    });
  });

  describe("KEPLER_ONLY_BODIES", () => {
    it("should include bodies without analytical models", () => {
      expect(KEPLER_ONLY_BODIES).toContain("eris");
      expect(KEPLER_ONLY_BODIES).toContain("vanth");
      expect(KEPLER_ONLY_BODIES).toContain("eris");
    });

    it("should not include bodies with analytical models", () => {
      expect(KEPLER_ONLY_BODIES).not.toContain("mercury");
      expect(KEPLER_ONLY_BODIES).not.toContain("jupiter");
    });
  });

  describe("Registry completeness", () => {
    it("should have unique body IDs", () => {
      const bodies = getAllRegisteredBodies();
      const uniqueBodies = new Set(bodies);
      expect(uniqueBodies.size).toBe(bodies.length);
    });

    it("should have valid metadata for all entries", () => {
      const bodies = getAllRegisteredBodies();
      for (const bodyId of bodies) {
        const metadata = getOrbitalMetadata(bodyId);
        expect(metadata).not.toBeNull();
        expect(metadata?.primaryModel).toBeDefined();
        expect(metadata?.primaryProvider).toBeDefined();
        expect(metadata?.fallbackProvider).toBeDefined();
      }
    });

    it("should have Kepler fallback for all analytical bodies", () => {
      for (const bodyId of ANALYTICAL_EPHEMERIS_BODIES) {
        const metadata = getOrbitalMetadata(bodyId);
        expect(metadata?.fallbackProvider).toBe("kepler");
      }
    });
  });
});
