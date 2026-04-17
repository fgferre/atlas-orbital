/**
 * VSOP87D planet provider.
 *
 * Wraps `astronomia/planetposition` + VSOP87D truncated series for the eight
 * major planets. VSOP87D publishes heliocentric spherical J2000 ecliptic
 * longitudes/latitudes/ranges — exactly the frame Atlas' engine expects.
 *
 * Accuracy (Meeus / Bretagnon / Francou 1988, D variant):
 * - Earth / inner planets: ~1–2 arcsec over 1900–2100
 * - Outer planets: ~2–5 arcsec over the same span
 * - Still arcsec-level across −2000 … +6000
 */

import * as THREE from "three";
import {
  Planet,
  type PlanetInstance,
  type Vsop87Series,
  vsop87Dmercury,
  vsop87Dvenus,
  vsop87Dearth,
  vsop87Dmars,
  vsop87Djupiter,
  vsop87Dsaturn,
  vsop87Duranus,
  vsop87Dneptune,
} from "./astronomiaShim";
import {
  sphericalEclipticToCartesian,
  ecliptic2ThreeJs,
  mod2Pi,
} from "./coordUtils";

export type Vsop87PlanetId =
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune";

/**
 * Remove corrupt `[NaN, NaN, NaN]` rows from the VSOP87D series.
 *
 * astronomia 4.2.0 ships vsop87Duranus.js and vsop87Dneptune.js with a
 * handful of NaN-filled rows (likely produced by the upstream conversion
 * script when a coefficient underflowed). A single NaN poisons the entire
 * Horner evaluation, yielding absurd longitudes (Neptune came back at
 * ~0\u00b0 instead of ~347\u00b0). Filtering those rows is safe: each row is an
 * independent periodic term, and the omitted contributions are by
 * construction smaller than any term the original table kept.
 */
function sanitizeVsopSeries(data: Vsop87Series): Vsop87Series {
  const clean = (block: Record<string, number[][]>) => {
    const out: Record<string, number[][]> = {};
    for (const key of Object.keys(block)) {
      out[key] = block[key].filter(
        (row) =>
          Array.isArray(row) &&
          row.length >= 3 &&
          Number.isFinite(row[0]) &&
          Number.isFinite(row[1]) &&
          Number.isFinite(row[2])
      );
    }
    return out;
  };
  return {
    ...data,
    L: clean(data.L),
    B: clean(data.B),
    R: clean(data.R),
  };
}

const PLANETS: Record<Vsop87PlanetId, PlanetInstance> = {
  mercury: new Planet(sanitizeVsopSeries(vsop87Dmercury)),
  venus: new Planet(sanitizeVsopSeries(vsop87Dvenus)),
  earth: new Planet(sanitizeVsopSeries(vsop87Dearth)),
  mars: new Planet(sanitizeVsopSeries(vsop87Dmars)),
  jupiter: new Planet(sanitizeVsopSeries(vsop87Djupiter)),
  saturn: new Planet(sanitizeVsopSeries(vsop87Dsaturn)),
  uranus: new Planet(sanitizeVsopSeries(vsop87Duranus)),
  neptune: new Planet(sanitizeVsopSeries(vsop87Dneptune)),
};

export const VSOP87_PLANET_IDS = Object.keys(PLANETS) as Vsop87PlanetId[];

export function isVsop87Planet(bodyId: string): bodyId is Vsop87PlanetId {
  return bodyId in PLANETS;
}

/**
 * Heliocentric J2000 ecliptic position in AU, returned in three.js frame.
 */
export function calculateVsop87Position(
  bodyId: Vsop87PlanetId,
  jdTDB: number
): THREE.Vector3 {
  const planet = PLANETS[bodyId];
  const { lon, lat, range } = planet.position2000(jdTDB);
  const ecl = sphericalEclipticToCartesian(mod2Pi(lon), lat, range);
  return ecliptic2ThreeJs(ecl);
}
