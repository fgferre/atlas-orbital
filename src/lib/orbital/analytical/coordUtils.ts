/**
 * Shared coordinate utilities for orbital providers.
 *
 * Conventions:
 * - "ecliptic" everywhere in this engine means **J2000 mean ecliptic**
 *   (X toward vernal equinox, Z toward ecliptic north), right-handed.
 * - Final output is wrapped into the three.js Y-up convention by
 *   `ecliptic2ThreeJs()` so every provider hands back vectors in the
 *   same frame as `KeplerProvider`.
 *
 * This module is the single source of truth for the Kepler solver and the
 * perifocal → ecliptic rotation. Both the analytical branches (satellites,
 * asteroids) and the Kepler fallback provider consume these helpers.
 */

import * as THREE from "three";

/** 1 astronomical unit in kilometres (IAU 2012 definition). */
export const AU_KM = 149597870.7;

/**
 * Convert spherical heliocentric/body-centric ecliptic J2000 (lon, lat, range)
 * to rectangular ecliptic J2000 (x, y, z).
 */
export function sphericalEclipticToCartesian(
  lonRad: number,
  latRad: number,
  rangeAU: number
): THREE.Vector3 {
  const cosLat = Math.cos(latRad);
  const x = rangeAU * cosLat * Math.cos(lonRad);
  const y = rangeAU * cosLat * Math.sin(lonRad);
  const z = rangeAU * Math.sin(latRad);
  return new THREE.Vector3(x, y, z);
}

/**
 * Remap an ecliptic J2000 vector (x toward vernal eq., z toward ecl. north)
 * into the three.js Y-up convention used across the engine: (x, z, −y).
 */
export function ecliptic2ThreeJs(ecl: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(ecl.x, ecl.z, -ecl.y);
}

/**
 * Solve Kepler's equation M = E − e·sin(E) for the eccentric anomaly E.
 *
 * Newton–Raphson with a bounded iteration budget plus a 1e-12 convergence
 * break. Handles eccentricities up to ~0.99 comfortably.
 */
export function solveKeplerRad(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/**
 * Rotate a point from the **perifocal plane** (x along periapsis, y 90° ahead
 * in the orbital plane) into the reference frame in which Ω, ω and i are
 * expressed — ecliptic J2000 for all our providers.
 *
 * Keeping this as a pure function lets both the mean-anomaly path (used by
 * `elementsToCartesian`) and the true-anomaly parametric sweep (used by
 * orbit-line rendering in `keplerProvider`) share one rotation.
 */
export function perifocalToEcliptic(
  xp: number,
  yp: number,
  OmegaRad: number,
  omegaRad: number,
  iRad: number
): THREE.Vector3 {
  const cosO = Math.cos(OmegaRad);
  const sinO = Math.sin(OmegaRad);
  const cosw = Math.cos(omegaRad);
  const sinw = Math.sin(omegaRad);
  const cosi = Math.cos(iRad);
  const sini = Math.sin(iRad);

  const x =
    xp * (cosw * cosO - sinw * sinO * cosi) -
    yp * (sinw * cosO + cosw * sinO * cosi);
  const y =
    xp * (cosw * sinO + sinw * cosO * cosi) +
    yp * (cosw * cosO * cosi - sinw * sinO);
  const z = xp * (sinw * sini) + yp * (cosw * sini);

  return new THREE.Vector3(x, y, z);
}

/**
 * Convert classical orbital elements into a cartesian position, using the
 * mean anomaly path (M → E via Kepler → perifocal → reference frame).
 *
 * @returns vector (x, y, z) in the same linear unit as `aLinear`, expressed
 *          in the frame of Ω / ω / i (ecliptic J2000 for all our providers).
 */
export function elementsToCartesian(params: {
  aLinear: number;
  e: number;
  iRad: number;
  OmegaRad: number;
  omegaRad: number;
  MRad: number;
}): THREE.Vector3 {
  const { aLinear, e, iRad, OmegaRad, omegaRad, MRad } = params;
  const E = solveKeplerRad(MRad, e);
  const xp = aLinear * (Math.cos(E) - e);
  const yp = aLinear * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  return perifocalToEcliptic(xp, yp, OmegaRad, omegaRad, iRad);
}

/** Normalise an angle to [0, 2π). */
export function mod2Pi(x: number): number {
  const twoPi = 2 * Math.PI;
  const r = x % twoPi;
  return r < 0 ? r + twoPi : r;
}
