/**
 * Asteroid provider (Ceres, Pallas, Vesta).
 *
 * Uses heliocentric J2000 ecliptic osculating elements at epoch 2020-01-01
 * and propagates them with a two-body Kepler step. The 1900-2050 validity
 * window is enforced by the engine, not by this module — outside the window
 * the engine routes to the Kepler fallback.
 *
 * Every entry below was produced by `scripts/derive-elements-from-fixtures.js`
 * against the corresponding Horizons fixture on disk, identical pipeline
 * as `satellites.ts`.
 *
 * Accuracy at the 2020-01-01 reference epoch: sub-arcsecond match to the
 * fixture. Multi-year drift is dominated by unmodeled planetary
 * perturbations (two-body propagation only); both Ceres and Vesta stay
 * well within the Phase-4 0.5° budget across ±1 year. Pallas has the
 * highest eccentricity (e ≈ 0.23) of the three and drifts marginally faster
 * but still inside the 0.5° envelope over the currently-validated window.
 */

import * as THREE from "three";
import type { OsculatingElements } from "../types";
import { elementsToCartesian, ecliptic2ThreeJs, mod2Pi } from "./coordUtils";

const D2R = Math.PI / 180;
const K2 = 0.01720209895 ** 2; // heliocentric gravitational parameter, AU^3/day^2
const MU_SUN = 1.0 * K2;
// 2020-01-01T00:00:00Z UT expressed in TDB Julian Date (see satellites.ts
// for the rationale; keeps the epoch aligned with the engine's jdTDB input).
const EPOCH_2020_JD = 2458849.500861648;

interface HeliocentricOsculating {
  /** Reference epoch as Julian Date. */
  epochJD: number;
  aAU: number;
  e: number;
  iDeg: number;
  OmegaDeg: number;
  omegaDeg: number;
  M0Deg: number;
}

/**
 * Heliocentric J2000 ecliptic osculating elements, all at epoch 2020-01-01.
 * Emitted by `scripts/derive-elements-from-fixtures.js`.
 */
const ASTEROIDS: Record<string, HeliocentricOsculating> = {
  ceres: {
    epochJD: EPOCH_2020_JD,
    aAU: 2.769289284,
    e: 0.076875,
    iDeg: 10.591278,
    OmegaDeg: 80.30119,
    omegaDeg: 73.808967,
    M0Deg: 130.31614,
  },
  pallas: {
    epochJD: EPOCH_2020_JD,
    aAU: 2.773200573,
    e: 0.230183,
    iDeg: 34.830715,
    OmegaDeg: 173.0577,
    omegaDeg: 310.133778,
    M0Deg: 112.795738,
  },
  vesta: {
    epochJD: EPOCH_2020_JD,
    aAU: 2.361908656,
    e: 0.088573,
    iDeg: 7.141815,
    OmegaDeg: 103.809289,
    omegaDeg: 150.835776,
    M0Deg: 163.37562,
  },
};

export const ASTEROID_IDS = Object.keys(ASTEROIDS);

export function isAnalyticalAsteroid(bodyId: string): boolean {
  return bodyId in ASTEROIDS;
}

/** Mean motion in deg/day from μ_sun and the semi-major axis. */
function meanMotionDegPerDay(aAU: number): number {
  return (Math.sqrt(MU_SUN / (aAU * aAU * aAU)) * 180) / Math.PI;
}

/**
 * Heliocentric position in AU for the requested asteroid, expressed in the
 * engine's three.js frame.
 */
export function calculateAsteroidPosition(
  bodyId: string,
  jdTDB: number
): THREE.Vector3 {
  const el = ASTEROIDS[bodyId];
  if (!el) {
    throw new Error(`No analytical asteroid entry for ${bodyId}`);
  }

  const nDegPerDay = meanMotionDegPerDay(el.aAU);
  const dt = jdTDB - el.epochJD;
  const Mdeg = el.M0Deg + nDegPerDay * dt;

  const rEcl = elementsToCartesian({
    aLinear: el.aAU,
    e: el.e,
    iRad: el.iDeg * D2R,
    OmegaRad: mod2Pi(el.OmegaDeg * D2R),
    omegaRad: mod2Pi(el.omegaDeg * D2R),
    MRad: mod2Pi(Mdeg * D2R),
  });

  return ecliptic2ThreeJs(rEcl);
}

/**
 * Osculating elements for the analytical asteroid at `jdTDB`. Used by the
 * engine to draw an orbit line whose plane and apsides match the live
 * analytical position, instead of falling back to `celestialBodies.ts`
 * placeholders.
 */
export function getAsteroidOsculatingElements(
  bodyId: string,
  jdTDB: number
): OsculatingElements | null {
  const el = ASTEROIDS[bodyId];
  if (!el) return null;

  const nDegPerDay = meanMotionDegPerDay(el.aAU);
  const dt = jdTDB - el.epochJD;
  const mNow = (((el.M0Deg + nDegPerDay * dt) % 360) + 360) % 360;

  return {
    a: el.aAU,
    e: el.e,
    i: el.iDeg,
    O: el.OmegaDeg,
    w: el.omegaDeg,
    M: mNow,
    n: nDegPerDay,
    epoch: el.epochJD,
  };
}
