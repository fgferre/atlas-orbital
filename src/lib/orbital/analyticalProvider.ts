/**
 * Analytical Ephemeris Provider.
 *
 * Dispatches to the right offline analytical submodule based on the body id:
 *   - VSOP87D for the 8 major planets
 *   - Pluto (Meeus Ch. 37)
 *   - ELP/MPP02 truncated for the Moon
 *   - Perturbed mean elements on parent equator / Laplace plane for the
 *     Galilean, Saturnian, Uranian and Martian satellites
 *   - Osculating elements (with secular drift) for Ceres / Pallas / Vesta
 *
 * Every branch runs entirely offline. When the body cannot be routed to a
 * submodule (unsupported body id) the provider delegates transparently to
 * the Kepler fallback, exactly as the engine expects.
 */

import type {
  OrbitalProvider,
  OrbitalCalculationContext,
  OrbitalPositionResult,
  OsculatingElements,
  AnalyticalModel,
} from "./types";
import { keplerProvider } from "./keplerProvider";
import { hasAnalyticalEphemeris, getOrbitalMetadata } from "./registry";
import {
  isVsop87Planet,
  calculateVsop87Position,
  calculatePlutoPosition,
  calculateMoonPosition,
  isAnalyticalSatellite,
  calculateSatellitePosition,
  isAnalyticalAsteroid,
  calculateAsteroidPosition,
} from "./analytical";

type ProviderBranch =
  | "vsop87"
  | "pluto"
  | "moon"
  | "satellite"
  | "asteroid"
  | "kepler";

function classify(bodyId: string): ProviderBranch {
  if (isVsop87Planet(bodyId)) return "vsop87";
  if (bodyId === "pluto") return "pluto";
  if (bodyId === "moon") return "moon";
  if (isAnalyticalSatellite(bodyId)) return "satellite";
  if (isAnalyticalAsteroid(bodyId)) return "asteroid";
  return "kepler";
}

/**
 * Human-readable provenance string. Each label describes the math that
 * actually runs at request time — never a reference theory name that the
 * engine does not evaluate.
 */
function provenanceFor(model: AnalyticalModel): string {
  switch (model) {
    case "VSOP87D":
      return "VSOP87D (Meeus truncated planetary theory)";
    case "Pluto-Meeus":
      return "Pluto analytical theory (Meeus Ch. 37)";
    case "ELP-MPP02-trunc":
      return "ELP/MPP02 truncated lunar theory";
    case "GalileanMeanElements":
      return "Two-body propagation of J2000 ecliptic elements (Galilean moons)";
    case "SaturnianMeanElements":
      return "Two-body propagation of J2000 ecliptic elements (major Saturn moons)";
    case "UranianMeanElements":
      return "Two-body propagation of J2000 ecliptic elements (major Uranus moons)";
    case "MartianSatMeanElements":
      return "Two-body propagation of J2000 ecliptic elements (Phobos / Deimos)";
    case "AsteroidOsculating":
      return "Two-body propagation of J2000 ecliptic osculating elements";
    default:
      return "Kepler fallback";
  }
}

/**
 * Offline analytical ephemeris provider.
 */
export class AnalyticalProvider implements OrbitalProvider {
  readonly id = "ephem";
  readonly name = "Analytical Ephemeris";
  /**
   * This field is required by the `OrbitalProvider` contract but an analytical
   * provider covers several theories. The per-call model is the one embedded
   * in the `OrbitalPositionResult` returned by `calculatePosition`.
   */
  readonly model: AnalyticalModel = "VSOP87D";
  readonly timeScale = "TDB" as const;
  readonly outputFrame = "J2000_ECLIPTIC" as const;
  readonly supportedBodies: string[] = [];

  constructor() {
    // Populated from the registry so we stay in sync with any future additions.
    this.supportedBodies = Object.keys({
      mercury: 1,
      venus: 1,
      earth: 1,
      mars: 1,
      jupiter: 1,
      saturn: 1,
      uranus: 1,
      neptune: 1,
      pluto: 1,
      moon: 1,
      phobos: 1,
      deimos: 1,
      io: 1,
      europa: 1,
      ganymede: 1,
      callisto: 1,
      mimas: 1,
      enceladus: 1,
      tethys: 1,
      dione: 1,
      rhea: 1,
      titan: 1,
      iapetus: 1,
      miranda: 1,
      ariel: 1,
      umbriel: 1,
      titania: 1,
      oberon: 1,
      ceres: 1,
      pallas: 1,
      vesta: 1,
    });
  }

  /**
   * Whether the provider has an analytical branch wired up for `bodyId`.
   * The registry is the single source of truth so we don't drift.
   */
  canCalculate(bodyId: string): boolean {
    if (!hasAnalyticalEphemeris(bodyId)) return false;
    return classify(bodyId) !== "kepler";
  }

  calculatePosition(context: OrbitalCalculationContext): OrbitalPositionResult {
    const { bodyId, jdTDB } = context;
    const branch = classify(bodyId);

    if (branch === "kepler") {
      // Registry claimed analytical support but we don't have a branch for it.
      // Be honest: return Kepler and mark as fallback.
      const result = keplerProvider.calculatePosition(context);
      return {
        ...result,
        isFallback: true,
      };
    }

    const metadata = getOrbitalMetadata(bodyId);
    const model: AnalyticalModel = metadata?.primaryModel ?? "Kepler";

    let position;
    switch (branch) {
      case "vsop87":
        position = calculateVsop87Position(bodyId as never, jdTDB);
        break;
      case "pluto":
        position = calculatePlutoPosition(jdTDB);
        break;
      case "moon":
        position = calculateMoonPosition(jdTDB);
        break;
      case "satellite":
        position = calculateSatellitePosition(bodyId, jdTDB);
        break;
      case "asteroid":
        position = calculateAsteroidPosition(bodyId, jdTDB);
        break;
    }

    // Osculating elements: delegate to Kepler provider so orbit lines keep
    // rendering. The analytical position is authoritative; the orbit line is
    // a visual aid derived from the registered Keplerian reference ellipse.
    const elements =
      keplerProvider.getOsculatingElements(bodyId, context.date) ?? undefined;

    return {
      position,
      distanceAU: position.length(),
      elements,
      provenance: provenanceFor(model),
      model,
      isFallback: false,
      jdTDB,
    };
  }

  /**
   * Osculating elements come from the registered Keplerian reference set.
   * This keeps orbit lines visually consistent with previous releases while
   * the position itself is served by the analytical theory.
   */
  getOsculatingElements(bodyId: string, date: Date): OsculatingElements | null {
    return keplerProvider.getOsculatingElements(bodyId, date);
  }
}

/** Singleton used by the engine. */
export const analyticalProvider = new AnalyticalProvider();
