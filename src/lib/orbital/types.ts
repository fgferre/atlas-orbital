import type * as THREE from "three";

/**
 * Orbital Provider Types and Interfaces
 *
 * Defines the contract for orbital position providers used by the engine.
 */

/**
 * Orbital model types supported by offline analytical ephemerides.
 *
 * Labels reflect what actually runs in the browser. Where a label differs
 * from the original reference theory named in PLAN.md, the comment records
 * the equivalence so provenance stays honest.
 */
export type AnalyticalModel =
  | "VSOP87D" // Meeus truncated planetary theory (Mercury through Neptune)
  | "Pluto-Meeus" // Meeus Ch. 37 Pluto heliocentric series
  | "ELP-MPP02-trunc" // Truncated ELP/MPP02 lunar theory
  // The satellite labels below say "Osculating2Body" and not "MeanElements"
  // on purpose: the element blocks in `analytical/satellites.ts` are
  // *osculating* elements inverted from a single Horizons state vector at
  // 2025-01-01, not mean elements of a perturbation theory. Only the mean
  // anomaly advances; i/Ω/ω stay frozen at epoch.
  | "GalileanOsculating2Body" // Two-body propagation of J2000 ecliptic osculating elements
  | "SaturnianOsculating2Body" // Two-body propagation of J2000 ecliptic osculating elements
  | "UranianOsculating2Body" // Two-body propagation of J2000 ecliptic osculating elements
  | "MartianSatOsculating2Body" // Two-body propagation of J2000 ecliptic osculating elements
  | "AsteroidOsculating" // Two-body propagation of J2000 ecliptic osculating elements (2000–2050 window)
  | "Kepler"; // Fallback Keplerian solver

/**
 * Time scale used by the provider
 */
export type TimeScale = "UTC" | "TT" | "TDB";

/**
 * Reference frame for position vectors
 */
export type ReferenceFrame = "ICRS" | "J2000_ECLIPTIC" | "J2000_EQUATORIAL";

/**
 * Validity range for a provider
 */
export interface ValidityRange {
  /** Start year (inclusive) */
  startYear: number;
  /** End year (inclusive) */
  endYear: number;
  /** Note about the validity window */
  note?: string;
}

/**
 * Osculating orbital elements at a given instant
 */
export interface OsculatingElements {
  /** Semi-major axis (AU) */
  a: number;
  /** Eccentricity */
  e: number;
  /** Inclination (degrees) */
  i: number;
  /** Longitude of ascending node (degrees) */
  O: number;
  /** Argument of periapsis (degrees) */
  w: number;
  /** Mean anomaly (degrees) */
  M: number;
  /** Mean motion (degrees/day) */
  n: number;
  /** Reference epoch for elements (Julian Date) */
  epoch: number;
}

/**
 * Result from an orbital position calculation
 */
export interface OrbitalPositionResult {
  /** Position in AU (ecliptic J2000 frame) */
  position: THREE.Vector3;
  /** Velocity in AU/day (optional) */
  velocity?: THREE.Vector3;
  /** Osculating elements at the calculation time (if available) */
  elements?: OsculatingElements;
  /** Distance from parent body in AU */
  distanceAU: number;
  /** Provenance label (e.g., "VSOP87D (Meeus truncated planetary theory)", "Kepler fallback") */
  provenance: string;
  /** Analytical model used */
  model: AnalyticalModel;
  /** Whether this result is from a fallback provider */
  isFallback: boolean;
  /** Julian Date used for calculation (TDB scale) */
  jdTDB: number;
}

/**
 * Context for orbital position calculation
 */
export interface OrbitalCalculationContext {
  /** Body ID */
  bodyId: string;
  /** Parent body ID (if any) */
  parentId?: string;
  /** JavaScript Date (UTC) */
  date: Date;
  /** Julian Date (TDB) - pre-computed for efficiency */
  jdTDB: number;
}

/**
 * Interface for orbital position providers
 *
 * All providers must implement this contract to be used by the orbital engine.
 */
export interface OrbitalProvider {
  /** Unique identifier for this provider */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Analytical model type */
  readonly model: AnalyticalModel;

  /** Time scale expected by this provider */
  readonly timeScale: TimeScale;

  /** Reference frame for output positions */
  readonly outputFrame: ReferenceFrame;

  /** Validity range (if limited) */
  readonly validityRange?: ValidityRange;

  /** Bodies supported by this provider */
  readonly supportedBodies: string[];

  /**
   * Check if this provider can calculate position for a given body
   * @param bodyId Body identifier
   * @param date Optional date for validity check
   */
  canCalculate(bodyId: string, date?: Date): boolean;

  /**
   * Calculate orbital position
   * @param context Calculation context
   * @returns Position result
   */
  calculatePosition(context: OrbitalCalculationContext): OrbitalPositionResult;

  /**
   * Get osculating elements at a given time (if available)
   * @param bodyId Body identifier
   * @param date JavaScript Date
   * @returns Osculating elements or null
   */
  getOsculatingElements?(bodyId: string, date: Date): OsculatingElements | null;
}

/**
 * Provider registry entry
 */
export interface ProviderRegistryEntry {
  /** Provider instance */
  provider: OrbitalProvider;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this is a fallback provider */
  isFallback: boolean;
}

/**
 * Metadata for orbital calculations (stored per body)
 */
export interface BodyOrbitalMetadata {
  /** Primary analytical model for this body */
  primaryModel: AnalyticalModel;
  /** Provider ID for primary model */
  primaryProvider: string;
  /** Fallback provider ID */
  fallbackProvider: string;
  /** Validity range for primary model */
  validityRange?: ValidityRange;
  /** Notes about the model */
  notes?: string;
}

/**
 * Cache entry for orbital positions
 */
export interface PositionCacheEntry {
  /** Cached position */
  result: OrbitalPositionResult;
  /** Julian Date (TDB) when calculated */
  jdTDB: number;
  /** Cache timestamp */
  timestamp: number;
}

/**
 * Configuration for the orbital engine
 */
export interface OrbitalEngineConfig {
  /** Enable position caching */
  enableCache: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Enable fallback providers */
  enableFallback: boolean;
  /** Log fallback usage */
  logFallbacks: boolean;
  /** Default time scale */
  defaultTimeScale: TimeScale;
}

/**
 * Default engine configuration
 */
export const DEFAULT_ENGINE_CONFIG: OrbitalEngineConfig = {
  enableCache: true,
  cacheTtlMs: 1000, // 1 second cache for real-time updates
  enableFallback: true,
  logFallbacks: false,
  defaultTimeScale: "TDB",
};

/**
 * Body type for orbital calculations
 */
export type OrbitalBodyType =
  | "star"
  | "planet"
  | "moon"
  | "dwarf"
  | "asteroid"
  | "comet"
  | "tno";

/**
 * Complete body definition for orbital calculations
 */
export interface OrbitalBody {
  id: string;
  name: string;
  type: OrbitalBodyType;
  parentId?: string;
  /** Mean radius in km */
  radiusKm: number;
  /** Mass in kg (optional) */
  massKg?: number;
  /** Orbital metadata */
  orbitalMetadata: BodyOrbitalMetadata;
  /** Keplerian elements (for fallback) */
  fallbackElements?: {
    a: number;
    e: number;
    i: number;
    O: number;
    w: number;
    M0: number;
    n: number;
  };
}
