/**
 * Asteroid provider (Ceres, Pallas, Vesta).
 *
 * Uses heliocentric J2000 ecliptic osculating elements at epoch 2025-01-01
 * and propagates them with a two-body Kepler step. The 2000-2050 validity
 * window is enforced by the engine, not by this module — outside the window
 * the engine routes to the Kepler fallback.
 *
 * The window is epoch ±25 yr, not the wider range this docblock advertised
 * until 2026-07-26. `registry.ts` VALIDITY_RANGES.asteroid is the enforced
 * source and records the derivation: the only far-epoch measurement on disk
 * is the ceres-1890-01-01 Horizons fixture at 7.40° angular error, and
 * interpolating that against the ±1 yr residual gives roughly dt^1.5 growth,
 * so anything wider was never measured and must not be advertised.
 *
 * Every entry below was produced by `scripts/derive-elements-from-fixtures.js`
 * against the corresponding Horizons fixture on disk, identical pipeline
 * as `satellites.ts`.
 *
 * Accuracy at the 2025-01-01 reference epoch: sub-arcsecond match to the
 * fixture. Multi-year drift is dominated by unmodeled planetary
 * perturbations (two-body propagation only); both Ceres and Vesta stay
 * well within the Phase-4 0.5° budget across ±1 year. Pallas has the
 * highest eccentricity (e ≈ 0.23) of the three and drifts marginally faster
 * but still inside the 0.5° envelope over the currently-validated window.
 */

import * as THREE from "three";
import type { OsculatingElements } from "../types";
import {
  elementsToCartesian,
  ecliptic2ThreeJs,
  mod2Pi,
  MU_SUN_AU3_PER_DAY2,
} from "./coordUtils";

const D2R = Math.PI / 180;
// Heliocentric μ☉ shared with the rest of the engine. Kept as a local alias
// to avoid churn in the call sites below.
const MU_SUN = MU_SUN_AU3_PER_DAY2;
// 2025-01-01T00:00:00Z UT expressed in TDB Julian Date (see satellites.ts
// for the rationale; keeps the epoch aligned with the engine's jdTDB input).
const EPOCH_2025_JD = 2460676.5008931975;

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
 * Heliocentric J2000 ecliptic osculating elements, all at epoch 2025-01-01.
 * Emitted by `scripts/derive-elements-from-fixtures.js`.
 */
const ASTEROIDS: Record<string, HeliocentricOsculating> = {
  ceres: {
    epochJD: EPOCH_2025_JD,
    aAU: 2.766360231,
    e: 0.079279,
    iDeg: 10.587933,
    OmegaDeg: 80.254308,
    omegaDeg: 73.262383,
    M0Deg: 162.150254,
  },
  pallas: {
    epochJD: EPOCH_2025_JD,
    aAU: 2.770234763,
    e: 0.2305,
    iDeg: 34.922344,
    OmegaDeg: 172.901824,
    omegaDeg: 310.894699,
    M0Deg: 142.309832,
  },
  vesta: {
    epochJD: EPOCH_2025_JD,
    aAU: 2.361078966,
    e: 0.090021,
    iDeg: 7.143939,
    OmegaDeg: 103.703637,
    omegaDeg: 151.639146,
    M0Deg: 298.710084,
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
