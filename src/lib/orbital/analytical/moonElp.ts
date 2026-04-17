/**
 * Moon provider using the truncated ELP/MPP02 lunar theory.
 *
 * `astronomia/elp` evaluates the ELP series and `data/elpMppDe` ships the
 * DE-fitted, truncated MPP02 coefficients (~640 KB). The output is in
 * rectangular J2000 mean ecliptic coordinates, geocentric, in kilometres.
 *
 * Accuracy of the MPP02-trunc variant:
 * - Position: ~2–5 arcsec over ±500 years from J2000 (well within the
 *   ELP2000 family envelope this project cares about).
 */

import * as THREE from "three";
import { elp, elpMppDe } from "./astronomiaShim";
import { AU_KM, ecliptic2ThreeJs } from "./coordUtils";

const moonInstance = new elp.Moon(elpMppDe);

/**
 * Geocentric Moon position in AU, in the engine's three.js frame.
 */
export function calculateMoonPosition(jdTDB: number): THREE.Vector3 {
  const { x, y, z } = moonInstance.positionXYZ(jdTDB);
  const ecl = new THREE.Vector3(x / AU_KM, y / AU_KM, z / AU_KM);
  return ecliptic2ThreeJs(ecl);
}
