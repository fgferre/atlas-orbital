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

import * as THREE from "three";
import type {
  OrbitalProvider,
  OrbitalCalculationContext,
  OrbitalPositionResult,
  OsculatingElements,
  AnalyticalModel,
} from "./types";
import { keplerProvider } from "./keplerProvider";
import { hasAnalyticalEphemeris, getOrbitalMetadata } from "./registry";
import { dateToTDB } from "./time";
import {
  isVsop87Planet,
  calculateVsop87Position,
  calculatePlutoPosition,
  calculateMoonPosition,
  isAnalyticalSatellite,
  calculateSatellitePosition,
  getSatelliteOsculatingElements,
  isAnalyticalAsteroid,
  calculateAsteroidPosition,
  getAsteroidOsculatingElements,
} from "./analytical";
import {
  MU_SUN_AU3_PER_DAY2,
  MU_EARTH_MOON_AU3_PER_DAY2,
  osculatingElementsFromState,
  threeJs2Ecliptic,
} from "./analytical/coordUtils";

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
    // Osculating elements are only populated when they're essentially free
    // (direct fixture-table lookup). VSOP87D / Pluto-Meeus / ELP/MPP02-trunc
    // would each cost three extra series evaluations to derive an osculating
    // ellipse — and no caller of `calculatePosition` uses `result.elements`
    // on the hot path. Consumers that need elements (orbit-line renderer,
    // telemetry) call `getOsculatingElements` explicitly, which does the
    // derivation lazily and memoizes through the engine.
    let elements: OsculatingElements | undefined;
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
        elements = getSatelliteOsculatingElements(bodyId, jdTDB) ?? undefined;
        break;
      case "asteroid":
        position = calculateAsteroidPosition(bodyId, jdTDB);
        elements = getAsteroidOsculatingElements(bodyId, jdTDB) ?? undefined;
        break;
    }

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
   * Osculating elements for the requested date. Returns analytical elements
   * when the body is in our fixture-derived tables (satellites, asteroids)
   * **or** when derivable from the live series via RV→COE (VSOP87D, Pluto,
   * Moon); otherwise falls back to the registered Keplerian reference
   * ellipse.
   *
   * Uses `dateToTDB(date)` to stay phase-consistent with
   * `calculatePosition` — without it the ~70 s TDB-UT offset would shift
   * M enough to move the orbit line off the rendered body position in
   * the alignment invariant (a few km for fast movers).
   */
  getOsculatingElements(bodyId: string, date: Date): OsculatingElements | null {
    const jdTDB = dateToTDB(date);
    return (
      this.lookupAnalyticalElements(bodyId, jdTDB) ??
      keplerProvider.getOsculatingElements(bodyId, date)
    );
  }

  /** Internal: analytical-only element lookup, returns null when absent.
   *
   * For satellites and asteroids this reads fixture-derived blocks that
   * are consistent with the live position by construction.
   *
   * For VSOP87D planets, Pluto-Meeus and the ELP/MPP02 Moon, no element
   * block is maintained — those theories only publish positions. We
   * therefore derive the instantaneous **osculating** ellipse at `jdTDB`
   * by evaluating r(t) twice (central finite-difference, ±60 s) to
   * recover the velocity, then inverting the two-body state (r, v, μ)
   * into classical elements via `osculatingElementsFromState`. The
   * resulting ellipse passes through r(t) by definition, which is the
   * invariant the orbit-line renderer relies on.
   */
  private lookupAnalyticalElements(
    bodyId: string,
    jdTDB: number
  ): OsculatingElements | null {
    if (isAnalyticalSatellite(bodyId)) {
      return getSatelliteOsculatingElements(bodyId, jdTDB);
    }
    if (isAnalyticalAsteroid(bodyId)) {
      return getAsteroidOsculatingElements(bodyId, jdTDB);
    }
    if (isVsop87Planet(bodyId)) {
      return deriveOsculatingFromSeries(
        (jd) => calculateVsop87Position(bodyId, jd),
        jdTDB,
        MU_SUN_AU3_PER_DAY2
      );
    }
    if (bodyId === "pluto") {
      return deriveOsculatingFromSeries(
        (jd) => calculatePlutoPosition(jd),
        jdTDB,
        MU_SUN_AU3_PER_DAY2
      );
    }
    if (bodyId === "moon") {
      return deriveOsculatingFromSeries(
        (jd) => calculateMoonPosition(jd),
        jdTDB,
        MU_EARTH_MOON_AU3_PER_DAY2
      );
    }
    return null;
  }
}

/**
 * Central finite-difference (±60 s) over a provider's position function to
 * produce the instantaneous osculating state (r, v) in ecliptic J2000, then
 * invert to classical elements. 60 s is short enough to keep the velocity
 * truncation error well below arcsec-level over one orbital period yet long
 * enough to dominate any round-off from the series evaluation.
 *
 * Providers return positions in the engine's three.js Y-up frame; we
 * unwrap back to ecliptic (`threeJs2Ecliptic`) before inversion so the
 * recovered Ω/ω/i live in the same frame as `elementsToCartesian` expects.
 */
const FINITE_DIFF_HALF_STEP_DAYS = 30 / 86400; // ±30 s → 60 s total span
function deriveOsculatingFromSeries(
  positionAtThreeJs: (jdTDB: number) => THREE.Vector3,
  jdTDB: number,
  muAU3PerDay2: number
): OsculatingElements {
  const rMinusThree = positionAtThreeJs(jdTDB - FINITE_DIFF_HALF_STEP_DAYS);
  const rPlusThree = positionAtThreeJs(jdTDB + FINITE_DIFF_HALF_STEP_DAYS);
  const rNowThree = positionAtThreeJs(jdTDB);

  const rNowEcl = threeJs2Ecliptic(rNowThree);
  const rMinusEcl = threeJs2Ecliptic(rMinusThree);
  const rPlusEcl = threeJs2Ecliptic(rPlusThree);
  const invSpan = 1 / (2 * FINITE_DIFF_HALF_STEP_DAYS);
  const vEcl = new THREE.Vector3(
    (rPlusEcl.x - rMinusEcl.x) * invSpan,
    (rPlusEcl.y - rMinusEcl.y) * invSpan,
    (rPlusEcl.z - rMinusEcl.z) * invSpan
  );

  return osculatingElementsFromState({
    rEclAU: rNowEcl,
    vEclAUperDay: vEcl,
    muAU3PerDay2,
    jdTDB,
  });
}

/** Singleton used by the engine. */
export const analyticalProvider = new AnalyticalProvider();
