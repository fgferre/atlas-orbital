/**
 * Pluto (Meeus Ch. 37) provider.
 *
 * Wraps `astronomia/pluto` which implements the Meeus periodic-series theory
 * based on the Jupiter / Saturn / Pluto resonance arguments. Valid 1885-2099
 * to sub-arcsecond accuracy on the sky.
 */

import * as THREE from "three";
import { pluto } from "./astronomiaShim";
import {
  sphericalEclipticToCartesian,
  ecliptic2ThreeJs,
  mod2Pi,
} from "./coordUtils";

export function calculatePlutoPosition(jdTDB: number): THREE.Vector3 {
  const { lon, lat, range } = pluto.heliocentric(jdTDB);
  const ecl = sphericalEclipticToCartesian(mod2Pi(lon), lat, range);
  return ecliptic2ThreeJs(ecl);
}
