/**
 * Analytical Ephemeris Provider (STUB)
 *
 * This is a placeholder implementation for the analytical ephemeris provider.
 * It currently delegates all calculations to the Kepler provider but logs
 * warnings indicating that analytical models are not yet implemented.
 *
 * PLAN.md requires implementation of:
 * - VSOP2013: Mercury, Venus, Earth, Mars
 * - TOP2013: Jupiter, Saturn, Uranus, Neptune, Pluto
 * - ELP2000: Moon
 * - MARSSAT: Phobos, Deimos
 * - L1: Io, Europa, Ganymede, Callisto
 * - TASS17: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
 * - GUST86: Miranda, Ariel, Umbriel, Titania, Oberon
 * - EPHASTER: Ceres, Pallas, Vesta (1900-2050)
 *
 * TODO: Replace stub with actual analytical calculations
 * TODO: Add numerical regression tests against NASA Horizons
 */

import type {
  OrbitalProvider,
  OrbitalCalculationContext,
  OrbitalPositionResult,
  OsculatingElements,
  AnalyticalModel,
} from "./types";
import { keplerProvider } from "./keplerProvider";
import { hasAnalyticalEphemeris } from "./registry";

/**
 * Analytical ephemeris provider stub
 *
 * Currently falls back to Kepler with console warnings.
 * When implemented, this will use VSOP2013, TOP2013, ELP2000, etc.
 */
export class AnalyticalProvider implements OrbitalProvider {
  readonly id = "ephem";
  readonly name = "Analytical Ephemeris (Stub)";
  // This provider handles multiple analytical models (VSOP2013, TOP2013, ELP2000, etc.)
  // The actual model per-body is returned in calculatePosition via getPlannedModel()
  readonly model = "Kepler" as const; // Currently falls back to Kepler for all bodies
  readonly timeScale = "TDB" as const;
  readonly outputFrame = "J2000_ECLIPTIC" as const;
  readonly supportedBodies: string[] = [];

  constructor() {
    // Bodies that SHOULD use analytical models (when implemented)
    // VSOP2013
    this.supportedBodies.push("mercury", "venus", "earth", "mars", "moon");
    // TOP2013
    this.supportedBodies.push(
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto"
    );
    // Other analytical models
    this.supportedBodies.push(
      "phobos",
      "deimos", // MARSSAT
      "io",
      "europa",
      "ganymede",
      "callisto", // L1
      "mimas",
      "enceladus",
      "tethys",
      "dione",
      "rhea",
      "titan",
      "iapetus", // TASS17
      "miranda",
      "ariel",
      "umbriel",
      "titania",
      "oberon", // GUST86
      "ceres",
      "pallas",
      "vesta" // EPHASTER
    );
  }

  /**
   * Check if this provider can calculate position for a given body
   */
  canCalculate(bodyId: string): boolean {
    // We claim we can calculate for bodies with analytical models
    // but will log warnings when actually called
    return hasAnalyticalEphemeris(bodyId);
  }

  /**
   * Calculate orbital position
   *
   * TODO: Implement actual analytical calculations
   * Currently falls back to Kepler with a warning
   */
  calculatePosition(context: OrbitalCalculationContext): OrbitalPositionResult {
    const { bodyId } = context;

    // Log warning that analytical models are not yet implemented
    console.warn(
      `[AnalyticalProvider] Analytical ephemeris not yet implemented for ${bodyId}. ` +
        `Falling back to Keplerian elements. ` +
        `Planned model: ${this.getPlannedModel(bodyId)}`
    );

    // Delegate to Kepler provider
    const result = keplerProvider.calculatePosition(context);

    // Mark as fallback and indicate the planned model
    return {
      ...result,
      provenance: "Kepler fallback",
      model: this.getPlannedModel(bodyId),
      isFallback: true,
    };
  }

  /**
   * Get osculating elements
   *
   * TODO: Return actual osculating elements from analytical models
   */
  getOsculatingElements(bodyId: string, date: Date): OsculatingElements | null {
    // Delegate to Kepler
    return keplerProvider.getOsculatingElements(bodyId, date);
  }

  /**
   * Get the planned analytical model for a body
   */
  private getPlannedModel(bodyId: string): AnalyticalModel {
    const modelMap: Record<string, AnalyticalModel> = {
      // VSOP2013
      mercury: "VSOP2013",
      venus: "VSOP2013",
      earth: "VSOP2013",
      mars: "VSOP2013",
      // TOP2013
      jupiter: "TOP2013",
      saturn: "TOP2013",
      uranus: "TOP2013",
      neptune: "TOP2013",
      pluto: "TOP2013",
      // ELP2000
      moon: "ELP2000",
      // MARSSAT
      phobos: "MARSSAT",
      deimos: "MARSSAT",
      // L1
      io: "L1",
      europa: "L1",
      ganymede: "L1",
      callisto: "L1",
      // TASS17
      mimas: "TASS17",
      enceladus: "TASS17",
      tethys: "TASS17",
      dione: "TASS17",
      rhea: "TASS17",
      titan: "TASS17",
      iapetus: "TASS17",
      // GUST86
      miranda: "GUST86",
      ariel: "GUST86",
      umbriel: "GUST86",
      titania: "GUST86",
      oberon: "GUST86",
      // EPHASTER
      ceres: "EPHASTER",
      pallas: "EPHASTER",
      vesta: "EPHASTER",
    };

    return modelMap[bodyId] || "Kepler";
  }
}

/**
 * Singleton instance
 */
export const analyticalProvider = new AnalyticalProvider();
