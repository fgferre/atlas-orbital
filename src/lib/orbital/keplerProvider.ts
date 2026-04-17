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
import { J2000_EPOCH } from "./time";

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
 * Solve Kepler's equation using Newton-Raphson iteration
 * @param M Mean anomaly (radians)
 * @param e Eccentricity
 * @returns Eccentric anomaly (radians)
 */
function solveKeplerEquation(M: number, e: number): number {
  let E = M;
  for (let k = 0; k < 5; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/**
 * Calculate position from Keplerian elements
 * @param elements Orbital elements
 * @param daysSinceJ2000 Days since J2000.0 epoch
 * @returns Position vector in AU (ecliptic J2000)
 */
function calculateKeplerianPosition(
  elements: KeplerianElements,
  daysSinceJ2000: number
): THREE.Vector3 {
  const { a, e, i, O, w, M0, n } = elements;

  // Calculate mean anomaly
  const M = (M0 + n * daysSinceJ2000) % 360;
  const M_rad = M * (Math.PI / 180);

  // Solve Kepler's equation
  const E = solveKeplerEquation(M_rad, e);

  // Calculate position in orbital plane
  const P = a * (Math.cos(E) - e);
  const Q = a * Math.sqrt(1 - e * e) * Math.sin(E);

  // Rotation angles
  const rad = Math.PI / 180;
  const cosO = Math.cos(O * rad);
  const sinO = Math.sin(O * rad);
  const cosw = Math.cos(w * rad);
  const sinw = Math.sin(w * rad);
  const cosi = Math.cos(i * rad);
  const sini = Math.sin(i * rad);

  // Transform to ecliptic coordinates
  // Standard astronomical convention
  const x =
    P * (cosw * cosO - sinw * sinO * cosi) -
    Q * (sinw * cosO + cosw * sinO * cosi);
  const y =
    P * (cosw * sinO + sinw * cosO * cosi) +
    Q * (cosw * cosO * cosi - sinw * sinO);
  const z = P * (sinw * sini) + Q * (cosw * sini);

  // Convert to Three.js coordinates (Y-up)
  // TODO: Fix coordinate frame alignment - see issue below
  return new THREE.Vector3(x, z, -y);
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
  const nuRad = nu * (Math.PI / 180);

  // Distance from focus (Sun/planet) at true anomaly
  // r = a(1-e²) / (1+e·cos(ν))
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(nuRad));

  // Position in orbital plane (perifocal coordinates)
  // x' = r·cos(ν), y' = r·sin(ν)
  const xOrbital = r * Math.cos(nuRad);
  const yOrbital = r * Math.sin(nuRad);

  // Rotation angles
  const rad = Math.PI / 180;
  const cosO = Math.cos(O * rad);
  const sinO = Math.sin(O * rad);
  const cosw = Math.cos(w * rad);
  const sinw = Math.sin(w * rad);
  const cosi = Math.cos(i * rad);
  const sini = Math.sin(i * rad);

  // Transform to ecliptic coordinates
  // Standard rotation from orbital plane to ecliptic frame
  const x =
    xOrbital * (cosw * cosO - sinw * sinO * cosi) -
    yOrbital * (sinw * cosO + cosw * sinO * cosi);
  const y =
    xOrbital * (cosw * sinO + sinw * cosO * cosi) +
    yOrbital * (cosw * cosO * cosi - sinw * sinO);
  const z = xOrbital * (sinw * sini) + yOrbital * (cosw * sini);

  // Convert to Three.js coordinates (Y-up)
  return new THREE.Vector3(x, z, -y);
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
  readonly timeScale = "UTC" as const;
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
    const { bodyId, date, jdTDB } = context;

    const elements = this.elementsDatabase.get(bodyId);
    if (!elements) {
      throw new Error(`No Keplerian elements registered for body: ${bodyId}`);
    }

    // Calculate days since J2000.0
    const daysSinceJ2000 = (date.getTime() - J2000_EPOCH.getTime()) / 86400000;

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

    const daysSinceJ2000 = (date.getTime() - J2000_EPOCH.getTime()) / 86400000;
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
