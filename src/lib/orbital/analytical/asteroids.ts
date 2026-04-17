/**
 * Asteroid provider (Ceres, Pallas, Vesta).
 *
 * Uses heliocentric J2000 ecliptic osculating elements at epoch 2020-01-01
 * (or J2000 for bodies without a Horizons fixture) and propagates them
 * with a two-body Kepler step. The 1900-2050 validity window is enforced
 * by the engine, not by this module — outside the window the engine routes
 * to the Kepler fallback.
 *
 * Accuracy:
 *   - Fixture-derived bodies (Ceres, Vesta today) match Horizons to sub-
 *     arcsecond at the reference epoch; drift over ±30 years is dominated
 *     by unmodeled planetary perturbations and stays well below the
 *     Phase-4 0.5° angular budget.
 *   - Pallas uses published J2000 elements (no fixture on disk yet) and is
 *     slightly less tight; it still stays within the 0.5° budget inside
 *     1900-2050.
 */

import * as THREE from "three";
import { elementsToCartesian, ecliptic2ThreeJs, mod2Pi } from "./coordUtils";

const D2R = Math.PI / 180;
const K2 = 0.01720209895 ** 2; // heliocentric gravitational parameter, AU^3/day^2
const MU_SUN = 1.0 * K2;
const J2000_JD = 2451545.0;
const EPOCH_2020_JD = 2458849.5;

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
 * Heliocentric J2000 ecliptic osculating elements.
 *
 * Ceres / Vesta come from inverting Horizons fixtures at 2020-01-01.
 * Pallas uses JPL SBDB J2000 osculating elements (good to sub-arcsecond
 * at epoch, drifts slowly over the 1900-2050 window).
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
  vesta: {
    epochJD: EPOCH_2020_JD,
    aAU: 2.361908656,
    e: 0.088573,
    iDeg: 7.141815,
    OmegaDeg: 103.809289,
    omegaDeg: 150.835776,
    M0Deg: 163.37562,
  },
  pallas: {
    epochJD: J2000_JD,
    aAU: 2.7722,
    e: 0.23125,
    iDeg: 34.8398,
    OmegaDeg: 173.0867,
    omegaDeg: 310.1603,
    M0Deg: 280.565,
  },
};

export const ASTEROID_IDS = Object.keys(ASTEROIDS);

export function isAnalyticalAsteroid(bodyId: string): boolean {
  return bodyId in ASTEROIDS;
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

  // Mean motion from Kepler III keeps n and a self-consistent.
  const nDegPerDay =
    (Math.sqrt(MU_SUN / (el.aAU * el.aAU * el.aAU)) * 180) / Math.PI;

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
