import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  sphericalEclipticToCartesian,
  ecliptic2ThreeJs,
  threeJs2Ecliptic,
  solveKeplerRad,
  perifocalToEcliptic,
  elementsToCartesian,
  mod2Pi,
  osculatingElementsFromState,
  MU_SUN_AU3_PER_DAY2,
  MU_EARTH_MOON_AU3_PER_DAY2,
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

  it("threeJs2Ecliptic is the inverse of ecliptic2ThreeJs", () => {
    for (const sample of [
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(-0.5, 7.1, -2.2),
      new THREE.Vector3(0, 0, 0),
    ]) {
      const round = threeJs2Ecliptic(ecliptic2ThreeJs(sample));
      expect(round.x).toBeCloseTo(sample.x, 12);
      expect(round.y).toBeCloseTo(sample.y, 12);
      expect(round.z).toBeCloseTo(sample.z, 12);
    }
  });
});

describe("coordUtils / μ constants", () => {
  it("MU_SUN matches k² to the Gaussian convention", () => {
    // k = 0.01720209895 rad/day → k² = μ☉ in AU³/day².
    expect(MU_SUN_AU3_PER_DAY2).toBeCloseTo(2.9591220828559115e-4, 18);
  });

  it("MU_EARTH_MOON recovers the anomalistic month via Kepler III", () => {
    // n = sqrt(μ/a³); T = 2π/n. With a = 0.002569555 AU (Moon mean
    // distance) and μ_earth+moon the period must land near 27.32 sidereal
    // days (geocentric two-body approximation).
    const a = 0.002569555;
    const n = Math.sqrt(MU_EARTH_MOON_AU3_PER_DAY2 / a ** 3);
    const Tdays = (2 * Math.PI) / n;
    expect(Tdays).toBeGreaterThan(27.2);
    expect(Tdays).toBeLessThan(27.5);
  });
});

describe("coordUtils / osculatingElementsFromState", () => {
  // Round-trip: build an analytical ellipse → propagate to r, v →
  // invert → the recovered elements must match the originals.
  const reference = {
    a: 1.23,
    e: 0.18,
    i: 17.4,
    O: 132.7,
    w: 48.3,
    M: 215.9,
  };
  const D2R = Math.PI / 180;

  function buildState(mu: number, Mdeg: number) {
    // Use elementsToCartesian to get r; derive v from the vis-viva-aware
    // perifocal velocity and rotate with the same perifocalToEcliptic.
    const MRad = mod2Pi(Mdeg * D2R);
    const E = solveKeplerRad(MRad, reference.e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const a = reference.a;
    const e = reference.e;
    const b = a * Math.sqrt(1 - e * e);

    // Perifocal r
    const xp = a * (cosE - e);
    const yp = b * sinE;

    // Ė = n / (1 − e·cos E), with n = sqrt(μ/a³)
    const n = Math.sqrt(mu / (a * a * a));
    const EDot = n / (1 - e * cosE);
    const xpDot = -a * sinE * EDot;
    const ypDot = b * cosE * EDot;

    const r = perifocalToEcliptic(
      xp,
      yp,
      reference.O * D2R,
      reference.w * D2R,
      reference.i * D2R
    );
    const v = perifocalToEcliptic(
      xpDot,
      ypDot,
      reference.O * D2R,
      reference.w * D2R,
      reference.i * D2R
    );
    return { r, v };
  }

  it("round-trips heliocentric elements (μ☉) to ≤ 1e-10", () => {
    const { r, v } = buildState(MU_SUN_AU3_PER_DAY2, reference.M);
    const elements = osculatingElementsFromState({
      rEclAU: r,
      vEclAUperDay: v,
      muAU3PerDay2: MU_SUN_AU3_PER_DAY2,
      jdTDB: 2460676.5,
    });
    expect(elements.a).toBeCloseTo(reference.a, 10);
    expect(elements.e).toBeCloseTo(reference.e, 10);
    expect(elements.i).toBeCloseTo(reference.i, 10);
    expect(elements.O).toBeCloseTo(reference.O, 10);
    expect(elements.w).toBeCloseTo(reference.w, 10);
    expect(elements.M).toBeCloseTo(reference.M, 10);
    expect(elements.epoch).toBe(2460676.5);
  });

  it("round-trips geocentric elements (μ_earth-moon) to ≤ 1e-10", () => {
    const { r, v } = buildState(MU_EARTH_MOON_AU3_PER_DAY2, reference.M);
    const elements = osculatingElementsFromState({
      rEclAU: r,
      vEclAUperDay: v,
      muAU3PerDay2: MU_EARTH_MOON_AU3_PER_DAY2,
      jdTDB: 2460676.5,
    });
    expect(elements.a).toBeCloseTo(reference.a, 10);
    expect(elements.e).toBeCloseTo(reference.e, 10);
    expect(elements.i).toBeCloseTo(reference.i, 10);
    expect(elements.O).toBeCloseTo(reference.O, 10);
    expect(elements.w).toBeCloseTo(reference.w, 10);
    expect(elements.M).toBeCloseTo(reference.M, 10);
  });

  it("regenerates r exactly when fed through elementsToCartesian", () => {
    // The key invariant for the orbit-line path: the recovered ellipse
    // must pass through the original r at its M.
    const { r, v } = buildState(MU_SUN_AU3_PER_DAY2, reference.M);
    const elements = osculatingElementsFromState({
      rEclAU: r,
      vEclAUperDay: v,
      muAU3PerDay2: MU_SUN_AU3_PER_DAY2,
      jdTDB: 2460676.5,
    });
    const reconstructed = elementsToCartesian({
      aLinear: elements.a,
      e: elements.e,
      iRad: elements.i * D2R,
      OmegaRad: mod2Pi(elements.O * D2R),
      omegaRad: mod2Pi(elements.w * D2R),
      MRad: mod2Pi(elements.M * D2R),
    });
    expect(reconstructed.distanceTo(r)).toBeLessThan(1e-12);
  });
});
