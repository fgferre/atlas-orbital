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
import type { OsculatingElements } from "../types";

/** 1 astronomical unit in kilometres (IAU 2012 definition). */
export const AU_KM = 149597870.7;

/**
 * Gaussian gravitational constant squared, i.e. the heliocentric
 * gravitational parameter in AU³/day² when masses are expressed in solar
 * masses and the Sun is given unit mass. This is the standard μ☉ used by
 * every analytical branch in the engine.
 *
 * Origin: IAU 1976 Gaussian constant k = 0.01720209895; k² gives AU³/day²
 * directly (`K = sqrt(GM_sun / AU^3) · day`). Already used locally in
 * `asteroids.ts` and `satellites.ts`; centralised here so downstream
 * provider code (VSOP87D, Pluto-Meeus osculating extraction) stays DRY.
 */
export const MU_SUN_AU3_PER_DAY2 = 0.01720209895 ** 2;

/**
 * Geocentric gravitational parameter for the Earth-Moon **system** in
 * AU³/day² (i.e. μ = G·(M_earth + M_moon)). Used by the RV→COE inversion
 * on the ELP-MPP02 geocentric Moon state so the derived osculating
 * semi-major axis reproduces the anomalistic month via Kepler III.
 *
 * Numerical value: μ☉ × (M_earth + M_moon)/M_sun = K² × 3.0404326e-6
 * (IAU 2015 TDB-consistent mass ratios). Verified by Kepler III against
 * Moon's anomalistic period (27.55 d, a ≈ 0.002570 AU).
 */
export const MU_EARTH_MOON_AU3_PER_DAY2 = MU_SUN_AU3_PER_DAY2 * 3.0404326e-6;

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
 * Inverse of `ecliptic2ThreeJs`: unwrap a three.js Y-up vector back into the
 * ecliptic J2000 frame (x toward vernal eq., z toward ecl. north). Used by
 * RV→COE extraction paths that receive provider positions in three.js
 * coordinates but need to invert elements in the ecliptic frame where Ω, ω,
 * i are defined.
 */
export function threeJs2Ecliptic(three: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(three.x, -three.z, three.y);
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

const R2D = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;

/**
 * Invert an instantaneous two-body state (r, v) into classical osculating
 * orbital elements, in the **ecliptic J2000** frame used by the engine's
 * element blocks (`elementsToCartesian` consumes the same convention).
 *
 * By construction the returned ellipse passes through `rEclAU` at its
 * current true anomaly — feeding the result back through
 * `generateOsculatingEllipsePoints` therefore yields a polyline whose
 * curve contains the original position up to IEEE-754 round-off.
 *
 * This is the standard Curtis / Vallado algorithm (h, node, e, ν → M, a).
 *
 * @param rEclAU        position, AU, ecliptic J2000
 * @param vEclAUperDay  velocity, AU/day, ecliptic J2000
 * @param muAU3PerDay2  gravitational parameter for the two-body pair
 *                      (μ☉ for heliocentric bodies, μ_earth-moon for the Moon)
 * @param jdTDB         Julian date (TDB) to stamp on the returned block
 */
export function osculatingElementsFromState(params: {
  rEclAU: THREE.Vector3;
  vEclAUperDay: THREE.Vector3;
  muAU3PerDay2: number;
  jdTDB: number;
}): OsculatingElements {
  const { rEclAU, vEclAUperDay, muAU3PerDay2: mu, jdTDB } = params;

  const r = rEclAU.length();
  const v2 = vEclAUperDay.lengthSq();
  const rDotV = rEclAU.dot(vEclAUperDay);

  // Specific angular momentum h = r × v
  const h = new THREE.Vector3().crossVectors(rEclAU, vEclAUperDay);
  const hMag = h.length();

  // Inclination (0 … π). h.z = hMag · cos(i).
  const iRad = Math.acos(
    THREE.MathUtils.clamp(h.z / Math.max(hMag, 1e-300), -1, 1)
  );

  // Node line N = k̂ × h = (−h.y, h.x, 0)
  const Nx = -h.y;
  const Ny = h.x;
  const nMag = Math.hypot(Nx, Ny);

  // RAAN (Ω). Equatorial orbit (nMag → 0) falls back to 0 — the ascending
  // node is undefined and convention in `elementsToCartesian` handles Ω=0
  // as "node on the x-axis", which matches the perifocal frame.
  let OmegaRad = 0;
  if (nMag > 1e-15) {
    OmegaRad = Math.atan2(Ny, Nx);
    if (OmegaRad < 0) OmegaRad += TWO_PI;
  }

  // Eccentricity vector: e = (1/μ)·[(v² − μ/r)·r − (r·v)·v]
  const invMu = 1 / mu;
  const scaleR = (v2 - mu / r) * invMu;
  const scaleV = rDotV * invMu;
  const eVec = new THREE.Vector3(
    scaleR * rEclAU.x - scaleV * vEclAUperDay.x,
    scaleR * rEclAU.y - scaleV * vEclAUperDay.y,
    scaleR * rEclAU.z - scaleV * vEclAUperDay.z
  );
  const e = eVec.length();

  // Argument of periapsis (ω). For circular orbits (e → 0) or equatorial
  // orbits (nMag → 0) the periapsis is undefined; fall back to 0 and let
  // the mean anomaly absorb the phase.
  let omegaRad = 0;
  if (e > 1e-12 && nMag > 1e-15) {
    const cosOmega = THREE.MathUtils.clamp(
      (Nx * eVec.x + Ny * eVec.y) / (nMag * e),
      -1,
      1
    );
    omegaRad = Math.acos(cosOmega);
    if (eVec.z < 0) omegaRad = TWO_PI - omegaRad;
  }

  // True anomaly ν: cos ν = (e · r)/(e·r). Use v_r = r·v sign to
  // disambiguate the hemisphere.
  let nuRad = 0;
  if (e > 1e-12) {
    const cosNu = THREE.MathUtils.clamp(eVec.dot(rEclAU) / (e * r), -1, 1);
    nuRad = Math.acos(cosNu);
    if (rDotV < 0) nuRad = TWO_PI - nuRad;
  } else {
    // Circular orbit: measure from node line instead.
    if (nMag > 1e-15) {
      const cosArg = THREE.MathUtils.clamp(
        (Nx * rEclAU.x + Ny * rEclAU.y) / (nMag * r),
        -1,
        1
      );
      nuRad = Math.acos(cosArg);
      if (rEclAU.z < 0) nuRad = TWO_PI - nuRad;
    } else {
      // Circular equatorial: measure from x-axis.
      nuRad = Math.atan2(rEclAU.y, rEclAU.x);
      if (nuRad < 0) nuRad += TWO_PI;
    }
  }

  // Semi-major axis from the vis-viva energy equation.
  const specificEnergy = v2 / 2 - mu / r;
  const a = -mu / (2 * specificEnergy);

  // Eccentric anomaly then mean anomaly. The half-angle form is stable
  // for all e in [0, 1).
  let MRad: number;
  if (e < 1) {
    const eAnom =
      2 *
      Math.atan2(
        Math.sqrt(Math.max(0, 1 - e)) * Math.sin(nuRad / 2),
        Math.sqrt(Math.max(0, 1 + e)) * Math.cos(nuRad / 2)
      );
    MRad = eAnom - e * Math.sin(eAnom);
  } else {
    // Non-elliptic fallback: keep ν as a stand-in phase so the ellipse
    // generator still has something coherent. The display layer only
    // calls this path for bound orbits in practice.
    MRad = nuRad;
  }
  MRad = ((MRad % TWO_PI) + TWO_PI) % TWO_PI;

  const nDegPerDay = (Math.sqrt(mu / (a * a * a)) * 180) / Math.PI;

  return {
    a,
    e,
    i: iRad * R2D,
    O: OmegaRad * R2D,
    w: omegaRad * R2D,
    M: MRad * R2D,
    n: nDegPerDay,
    epoch: jdTDB,
  };
}
