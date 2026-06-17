/**
 * Kepler Fallback Orbital Provider
 *
 * Provides orbital position calculations using Keplerian elements.
 * This is the fallback provider when analytical ephemerides are not available
 * or outside their validity range.
 *
 * Based on the existing AstroPhysics.calculatePhysicalLocalPositionAU implementation.
 */

import * as THREE from "three";
import type {
  OrbitalProvider,
  OrbitalCalculationContext,
  OrbitalPositionResult,
  OsculatingElements,
} from "./types";
import { dateToTDB } from "./time";
import {
  elementsToCartesian,
  ecliptic2ThreeJs,
  perifocalToEcliptic,
  mod2Pi,
} from "./analytical/coordUtils";

const D2R = Math.PI / 180;

/**
 * Keplerian orbital elements interface
 */
interface KeplerianElements {
  a: number; // Semi-major axis (AU)
  e: number; // Eccentricity
  i: number; // Inclination (degrees)
  O: number; // Longitude of ascending node (degrees)
  w: number; // Argument of periapsis (degrees)
  M0: number; // Mean anomaly at epoch (degrees)
  n: number; // Mean motion (degrees/day)
}

/**
 * Calculate position from Keplerian elements (mean-anomaly path).
 *
 * Delegates to the shared `elementsToCartesian` helper so the Kepler fallback
 * and the analytical satellite / asteroid branches use one solver and one
 * rotation.
 */
function calculateKeplerianPosition(
  elements: KeplerianElements,
  daysSinceJ2000: number
): THREE.Vector3 {
  const { a, e, i, O, w, M0, n } = elements;
  const Mdeg = (M0 + n * daysSinceJ2000) % 360;
  const rEcl = elementsToCartesian({
    aLinear: a,
    e,
    iRad: i * D2R,
    OmegaRad: mod2Pi(O * D2R),
    omegaRad: mod2Pi(w * D2R),
    MRad: mod2Pi(Mdeg * D2R),
  });
  return ecliptic2ThreeJs(rEcl);
}

/**
 * Calculate osculating elements at given time
 * For Keplerian orbits, elements are constant except mean anomaly
 */
function calculateOsculatingElements(
  elements: KeplerianElements,
  daysSinceJ2000: number
): OsculatingElements {
  const M = (elements.M0 + elements.n * daysSinceJ2000) % 360;

  return {
    a: elements.a,
    e: elements.e,
    i: elements.i,
    O: elements.O,
    w: elements.w,
    M: M < 0 ? M + 360 : M,
    n: elements.n,
    epoch: 2451545.0 + daysSinceJ2000,
  };
}

/**
 * Calculate position on osculating ellipse from true anomaly
 * Used for orbit line generation via parametric sweep
 * @param a Semi-major axis (AU)
 * @param e Eccentricity
 * @param i Inclination (degrees)
 * @param O Longitude of ascending node (degrees)
 * @param w Argument of periapsis (degrees)
 * @param nu True anomaly (degrees)
 * @returns Position vector in AU (ecliptic J2000)
 */
function calculatePositionFromTrueAnomaly(
  a: number,
  e: number,
  i: number,
  O: number,
  w: number,
  nu: number
): THREE.Vector3 {
  const nuRad = nu * D2R;

  // Distance from focus (Sun/planet) at true anomaly:
  // r = a(1-e²) / (1+e·cos(ν))
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nuRad));
  const xp = r * Math.cos(nuRad);
  const yp = r * Math.sin(nuRad);

  const rEcl = perifocalToEcliptic(
    xp,
    yp,
    mod2Pi(O * D2R),
    mod2Pi(w * D2R),
    i * D2R
  );
  return ecliptic2ThreeJs(rEcl);
}

/**
 * Generate orbit points from osculating elements using parametric ellipse
 * Sweeps true anomaly from 0 to 2π to generate a clean ellipse
 * @param elements Osculating elements
 * @param segments Number of points to generate
 * @returns Array of position vectors in AU
 */
export function generateOsculatingEllipsePoints(
  elements: OsculatingElements,
  segments: number = 128
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const { a, e, i, O, w } = elements;

  // Sweep true anomaly from 0 to 360 degrees
  for (let j = 0; j <= segments; j++) {
    const nu = (j / segments) * 360; // True anomaly in degrees
    const pos = calculatePositionFromTrueAnomaly(a, e, i, O, w, nu);
    points.push(pos);
  }

  return points;
}

/**
 * Keplerian fallback orbital provider
 */
export class KeplerProvider implements OrbitalProvider {
  readonly id = "kepler";
  readonly name = "Keplerian Solver";
  readonly model = "Kepler" as const;
  // Both calculatePosition (context.jdTDB) and getOsculatingElements
  // (dateToTDB) advance on the TDB timescale the analytical providers use.
  readonly timeScale = "TDB" as const;
  readonly outputFrame = "J2000_ECLIPTIC" as const;
  readonly supportedBodies: string[] = [];

  /**
   * Orbital elements database (populated from celestialBodies.ts)
   */
  private elementsDatabase: Map<string, KeplerianElements> = new Map();

  constructor() {
    // Elements will be registered from the celestial bodies data
  }

  /**
   * Register orbital elements for a body
   */
  registerBody(bodyId: string, elements: KeplerianElements): void {
    this.elementsDatabase.set(bodyId, elements);
    if (!this.supportedBodies.includes(bodyId)) {
      this.supportedBodies.push(bodyId);
    }
  }

  /**
   * Check if this provider can calculate position for a body
   */
  canCalculate(bodyId: string): boolean {
    return this.elementsDatabase.has(bodyId);
  }

  /**
   * Calculate orbital position using Keplerian elements
   */
  calculatePosition(context: OrbitalCalculationContext): OrbitalPositionResult {
    const { bodyId, jdTDB } = context;

    const elements = this.elementsDatabase.get(bodyId);
    if (!elements) {
      throw new Error(`No Keplerian elements registered for body: ${bodyId}`);
    }

    // Calculate days since J2000.0 on the TDB timescale, matching the
    // analytical providers (which use context.jdTDB). Using the raw
    // UTC `date` here advanced the mean anomaly on a clock ~69 s behind
    // TDB, so a body's Kepler-fallback position disagreed in phase with
    // its analytical sibling. jdTDB is already computed by the engine.
    const daysSinceJ2000 = jdTDB - 2451545.0;

    // Calculate position
    const position = calculateKeplerianPosition(elements, daysSinceJ2000);

    // Calculate osculating elements
    const osculatingElements = calculateOsculatingElements(
      elements,
      daysSinceJ2000
    );

    return {
      position,
      distanceAU: position.length(),
      elements: osculatingElements,
      provenance: "Kepler fallback",
      model: "Kepler",
      isFallback: true,
      jdTDB,
    };
  }

  /**
   * Get osculating elements at given time
   */
  getOsculatingElements(bodyId: string, date: Date): OsculatingElements | null {
    const elements = this.elementsDatabase.get(bodyId);
    if (!elements) return null;

    // Match calculatePosition: advance the osculating elements on the TDB
    // timescale the analytical providers use, not raw UTC — otherwise the
    // orbit-line elements lag the marker position by ~69 s of mean anomaly
    // (the same position-vs-sibling phase bug this provider's position path
    // was just fixed to avoid).
    const daysSinceJ2000 = dateToTDB(date) - 2451545.0;
    return calculateOsculatingElements(elements, daysSinceJ2000);
  }
}

/**
 * Singleton instance of the Kepler provider
 */
export const keplerProvider = new KeplerProvider();

/**
 * Helper function to register a body from CelestialBody data
 */
export function registerKeplerBody(
  bodyId: string,
  orbit: {
    a: number;
    e: number;
    i: number;
    O: number;
    w: number;
    M0: number;
    n: number;
  }
): void {
  keplerProvider.registerBody(bodyId, orbit);
}
