import { describe, it, expect } from "vitest";
import {
  J2000_EPOCH,
  J2000_JD,
  dateToJD,
  jdToDate,
  dateToTDB,
  tdbToDate,
  jdToJulianYears,
  dateToJulianYears,
  julianYearsToDate,
  convertTime,
  calculateDeltaT,
  jdTTToTDB,
} from "./time";

describe("Time Utilities", () => {
  describe("J2000 Constants", () => {
    it("should have correct J2000 epoch", () => {
      expect(J2000_EPOCH.toISOString()).toBe("2000-01-01T12:00:00.000Z");
    });

    it("should have correct J2000 JD", () => {
      expect(J2000_JD).toBe(2451545.0);
    });
  });

  describe("Date to JD conversion", () => {
    it("should convert J2000 epoch to correct JD", () => {
      const jd = dateToJD(J2000_EPOCH);
      expect(jd).toBeCloseTo(2451545.0, 5);
    });

    it("should convert 2020-01-01 to approximately 2458849.5", () => {
      const date = new Date("2020-01-01T00:00:00Z");
      const jd = dateToJD(date);
      // JD 2458849.5 corresponds to 2020-01-01 00:00:00 UT
      expect(jd).toBeCloseTo(2458849.5, 1);
    });

    it("should be reversible", () => {
      const original = new Date("2023-06-15T12:30:45Z");
      const jd = dateToJD(original);
      const recovered = jdToDate(jd);
      expect(recovered.getTime()).toBeCloseTo(original.getTime(), -2); // Within ~100ms
    });
  });

  describe("TDB conversion", () => {
    it("should convert date to TDB", () => {
      const date = new Date("2020-01-01T00:00:00Z");
      const jdTDB = dateToTDB(date);
      // TDB should be close to UT (within seconds)
      const jdUT = dateToJD(date);
      const diffSeconds = (jdTDB - jdUT) * 86400;
      expect(Math.abs(diffSeconds)).toBeLessThan(100); // Delta-T + TDB-TT < 100s
    });

    it("should be reversible", () => {
      const original = new Date("2023-06-15T12:30:45Z");
      const jdTDB = dateToTDB(original);
      const recovered = tdbToDate(jdTDB);
      expect(recovered.getTime()).toBeCloseTo(original.getTime(), -1); // Within ~1s
    });
  });

  describe("Julian Years", () => {
    it("should convert J2000 to 0 Julian years", () => {
      const jy = dateToJulianYears(J2000_EPOCH);
      expect(jy).toBeCloseTo(0, 6);
    });

    it("should convert 2001-01-01 to approximately 1 Julian year", () => {
      const date = new Date("2001-01-01T12:00:00Z");
      const jy = dateToJulianYears(date);
      expect(jy).toBeCloseTo(1.0, 1);
    });

    it("should be reversible", () => {
      const jy = 23.5; // 23.5 Julian years from J2000
      const date = julianYearsToDate(jy);
      const recovered = dateToJulianYears(date);
      expect(recovered).toBeCloseTo(jy, 6);
    });

    it("should convert JD to Julian years correctly", () => {
      const jd = 2451545.0 + 365.25 * 10; // 10 Julian years
      const jy = jdToJulianYears(jd);
      expect(jy).toBeCloseTo(10.0, 6);
    });
  });

  describe("Delta-T", () => {
    // Contract: ΔT must track the published Espenak & Meeus / IERS record
    // across the whole window our providers advertise in registry.ts
    // (VSOP87 spans −2000…+6000), not just the modern era. Tolerances are
    // ~0.5 % — enough to catch a wrong branch, loose enough to survive a
    // decimal-year convention tweak.
    const PUBLISHED: ReadonlyArray<[year: number, deltaTSeconds: number]> = [
      [-500, 17190],
      [0, 10580],
      [500, 5710],
      [1000, 1570],
      [1500, 198],
      [1700, 9],
      [1800, 13.7],
      [1900, -2.8],
      [1950, 29.1],
      [2000, 63.8],
    ];

    it.each(PUBLISHED)(
      "matches the published Delta-T at year %i (%f s)",
      (year, expected) => {
        const date = new Date(Date.UTC(2000, 0, 1));
        date.setUTCFullYear(year);
        // Absolute floor of 1 s keeps the near-zero 1900 epoch meaningful.
        const tolerance = Math.max(1, Math.abs(expected) * 0.005);
        expect(Math.abs(calculateDeltaT(date) - expected)).toBeLessThanOrEqual(
          tolerance
        );
      }
    );

    it("keeps growing quadratically past the fitted window (no clamp)", () => {
      // The old model clamped to 100 s, which silently froze ΔT for any
      // Timeline scrub past ~2070 while the UI still claimed validity.
      expect(calculateDeltaT(new Date(Date.UTC(3000, 0, 1)))).toBeGreaterThan(
        4000
      );
      expect(
        calculateDeltaT(new Date(Date.UTC(2150, 0, 1)))
      ).toBeGreaterThanOrEqual(calculateDeltaT(new Date(Date.UTC(2100, 0, 1))));
    });

    it("should increase over time", () => {
      const deltaT2000 = calculateDeltaT(new Date("2000-01-01"));
      const deltaT2020 = calculateDeltaT(new Date("2020-01-01"));
      expect(deltaT2020).toBeGreaterThan(deltaT2000);
    });
  });

  describe("TT to TDB", () => {
    it("should apply small correction to TT", () => {
      const jdTT = 2458849.5; // 2020-01-01
      const jdTDB = jdTTToTDB(jdTT);
      const diffMs = (jdTDB - jdTT) * 86400 * 1000;
      // TDB-TT is on the order of milliseconds
      expect(Math.abs(diffMs)).toBeLessThan(10);
    });

    it("should be periodic (annual variation)", () => {
      const jd1 = 2458849.5; // 2020-01-01
      const jd2 = 2458850.0; // Half day later
      const tdb1 = jdTTToTDB(jd1);
      const tdb2 = jdTTToTDB(jd2);
      // The TDB offset should change slightly
      expect(tdb2).not.toBe(tdb1);
    });
  });

  describe("convertTime", () => {
    it("should return all time scales", () => {
      const date = new Date("2020-06-15T00:00:00Z");
      const result = convertTime(date);

      expect(result.date).toBe(date);
      expect(result.jdUT).toBeGreaterThan(2400000);
      expect(result.jdTT).toBeGreaterThan(result.jdUT);
      expect(result.jdTDB).toBeDefined();
      expect(result.julianYears).toBeDefined();
      expect(result.julianCenturies).toBeDefined();
      expect(result.deltaT).toBeGreaterThan(0);
    });

    it("should have TT after UT", () => {
      const date = new Date("2020-01-01");
      const result = convertTime(date);
      expect(result.jdTT).toBeGreaterThan(result.jdUT);
    });
  });

  describe("Edge cases", () => {
    it("should handle dates before J2000", () => {
      const date = new Date("1990-01-01T12:00:00Z");
      const jy = dateToJulianYears(date);
      expect(jy).toBeLessThan(0);
    });

    it("should handle far future dates", () => {
      const date = new Date("2050-01-01T12:00:00Z");
      const jd = dateToJD(date);
      expect(jd).toBeGreaterThan(2451545.0);
    });

    it("should handle epoch boundaries", () => {
      const date1900 = new Date("1900-01-01T12:00:00Z");
      const date2100 = new Date("2100-01-01T12:00:00Z");

      expect(() => dateToJD(date1900)).not.toThrow();
      expect(() => dateToJD(date2100)).not.toThrow();
      expect(() => dateToTDB(date1900)).not.toThrow();
      expect(() => dateToTDB(date2100)).not.toThrow();
    });
  });
});
