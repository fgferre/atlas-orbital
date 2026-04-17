import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  sphericalEclipticToCartesian,
  ecliptic2ThreeJs,
  solveKeplerRad,
  perifocalToEcliptic,
  elementsToCartesian,
  mod2Pi,
  AU_KM,
} from "./coordUtils";

const TWO_PI = 2 * Math.PI;

describe("coordUtils / constants", () => {
  it("defines AU_KM to the IAU 2012 value", () => {
    expect(AU_KM).toBe(149597870.7);
  });
});

describe("coordUtils / mod2Pi", () => {
  it("is identity inside [0, 2π)", () => {
    expect(mod2Pi(0)).toBe(0);
    expect(mod2Pi(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(mod2Pi(1.7 * Math.PI)).toBeCloseTo(1.7 * Math.PI, 12);
  });

  it("wraps large positive values", () => {
    expect(mod2Pi(3 * TWO_PI + 0.5)).toBeCloseTo(0.5, 12);
  });

  it("wraps negative values into [0, 2π)", () => {
    expect(mod2Pi(-0.1)).toBeCloseTo(TWO_PI - 0.1, 12);
    expect(mod2Pi(-TWO_PI - 1)).toBeCloseTo(TWO_PI - 1, 12);
  });
});

describe("coordUtils / solveKeplerRad", () => {
  it("returns M when eccentricity is zero (circular orbit)", () => {
    for (const M of [0, 0.7, Math.PI, 3.0]) {
      expect(solveKeplerRad(M, 0)).toBeCloseTo(M, 12);
    }
  });

  it("inverts M = E − e·sin(E) to within 1e-10 rad for e up to 0.9", () => {
    for (const e of [0.01, 0.1, 0.3, 0.6, 0.9]) {
      for (const E_true of [0.3, 1.2, 2.5, 4.0]) {
        const M = E_true - e * Math.sin(E_true);
        const E = solveKeplerRad(M, e);
        expect(E).toBeCloseTo(E_true, 10);
      }
    }
  });

  it("handles M at apsides (M=0 and M=π)", () => {
    expect(solveKeplerRad(0, 0.5)).toBeCloseTo(0, 12);
    expect(solveKeplerRad(Math.PI, 0.5)).toBeCloseTo(Math.PI, 10);
  });
});

describe("coordUtils / perifocalToEcliptic", () => {
  it("is identity when Ω = ω = i = 0", () => {
    const v = perifocalToEcliptic(1.2, -0.4, 0, 0, 0);
    expect(v.x).toBeCloseTo(1.2, 12);
    expect(v.y).toBeCloseTo(-0.4, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it("rotates by ω around the ecliptic pole when i=Ω=0", () => {
    // With i=Ω=0 the orbital plane IS the reference plane; a pure ω rotation
    // around z should move (1,0,0) to (cosω, sinω, 0).
    const omega = Math.PI / 3;
    const v = perifocalToEcliptic(1, 0, 0, omega, 0);
    expect(v.x).toBeCloseTo(Math.cos(omega), 12);
    expect(v.y).toBeCloseTo(Math.sin(omega), 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it("tilts the orbital plane by i when ω=0 and periapsis is on the node line", () => {
    // At ω=0, the perifocal +x lies on the ascending node, so a point
    // 90° ahead (+y perifocal) should lift to +z·sin(i) when Ω=0.
    const i = Math.PI / 6;
    const v = perifocalToEcliptic(0, 1, 0, 0, i);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(Math.cos(i), 12);
    expect(v.z).toBeCloseTo(Math.sin(i), 12);
  });
});

describe("coordUtils / elementsToCartesian", () => {
  it("returns the periapsis vector at M=0 (r = a(1-e))", () => {
    const a = 2.5;
    const e = 0.2;
    const v = elementsToCartesian({
      aLinear: a,
      e,
      iRad: 0,
      OmegaRad: 0,
      omegaRad: 0,
      MRad: 0,
    });
    expect(v.x).toBeCloseTo(a * (1 - e), 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it("returns the apoapsis vector at M=π (r = a(1+e))", () => {
    const a = 1.0;
    const e = 0.3;
    const v = elementsToCartesian({
      aLinear: a,
      e,
      iRad: 0,
      OmegaRad: 0,
      omegaRad: 0,
      MRad: Math.PI,
    });
    expect(v.x).toBeCloseTo(-a * (1 + e), 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it("produces a circular orbit of radius a when e=0", () => {
    const a = 1.5;
    for (const M of [0, 0.7, Math.PI / 2, 2.3, Math.PI, 5.0]) {
      const v = elementsToCartesian({
        aLinear: a,
        e: 0,
        iRad: 0,
        OmegaRad: 0,
        omegaRad: 0,
        MRad: M,
      });
      expect(v.length()).toBeCloseTo(a, 12);
    }
  });
});

describe("coordUtils / frame helpers", () => {
  it("sphericalEclipticToCartesian agrees with the spherical identity", () => {
    const lon = 0.3;
    const lat = -0.1;
    const r = 1.7;
    const v = sphericalEclipticToCartesian(lon, lat, r);
    expect(v.length()).toBeCloseTo(r, 12);
    expect(v.x).toBeCloseTo(r * Math.cos(lat) * Math.cos(lon), 12);
    expect(v.y).toBeCloseTo(r * Math.cos(lat) * Math.sin(lon), 12);
    expect(v.z).toBeCloseTo(r * Math.sin(lat), 12);
  });

  it("ecliptic2ThreeJs remaps (x, y, z) → (x, z, −y)", () => {
    const v = ecliptic2ThreeJs(new THREE.Vector3(1, 2, 3));
    expect(v.x).toBe(1);
    expect(v.y).toBe(3);
    expect(v.z).toBe(-2);
  });
});
