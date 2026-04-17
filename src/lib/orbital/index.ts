/**
 * Orbital Engine Module
 *
 * Centralized orbital calculation system with provider-based architecture.
 *
 * Usage:
 * ```typescript
 * import { orbitalEngine, getOrbitalProvenance } from "@/lib/orbital";
 *
 * // Calculate position
 * const result = orbitalEngine.calculatePosition("mars", new Date());
 * console.log(result.position); // THREE.Vector3 in AU
 * console.log(result.provenance); // "VSOP87D" or "Kepler fallback"
 *
 * // Get provenance info
 * const prov = getOrbitalProvenance("ceres");
 * console.log(prov.model); // "AsteroidOsculating" (with validity check)
 * ```
 */

// Time utilities
export {
  J2000_EPOCH,
  J2000_JD,
  dateToJD,
  jdToDate,
  dateToTDB,
  tdbToDate,
  jdToJulianYears,
  dateToJulianYears,
  convertTime,
  type TimeConversionResult,
} from "./time";

// Types
export type {
  AnalyticalModel,
  TimeScale,
  ReferenceFrame,
  ValidityRange,
  OsculatingElements,
  OrbitalPositionResult,
  OrbitalCalculationContext,
  OrbitalProvider,
  ProviderRegistryEntry,
  BodyOrbitalMetadata,
  PositionCacheEntry,
  OrbitalEngineConfig,
  OrbitalBodyType,
  OrbitalBody,
} from "./types";

export { DEFAULT_ENGINE_CONFIG } from "./types";

// Registry
export {
  ORBITAL_METADATA_REGISTRY,
  VALIDITY_RANGES,
  getOrbitalMetadata,
  hasAnalyticalEphemeris,
  getBodiesByModel,
  isWithinValidityRange,
  getAllRegisteredBodies,
  ANALYTICAL_EPHEMERIS_BODIES,
  KEPLER_ONLY_BODIES,
} from "./registry";

// Providers
export { keplerProvider, registerKeplerBody } from "./keplerProvider";
export { analyticalProvider, AnalyticalProvider } from "./analyticalProvider";
export { generateOsculatingEllipsePoints } from "./keplerProvider";

// Engine
export {
  OrbitalEngine,
  orbitalEngine,
  calculateOrbitalPosition,
  getOrbitalProvenance,
} from "./engine";

// Setup
export { initializeOrbitalEngine } from "./setup";

// Integration
export {
  resolveOrbitalDisplayPosition,
  getOrbitalDisplayOrbitPoints,
} from "./integration";
