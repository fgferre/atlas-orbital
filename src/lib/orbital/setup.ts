/**
 * Orbital Engine Setup
 *
 * Bridges the existing celestialBodies.ts data with the orbital engine.
 * Registers all bodies with their Keplerian elements for fallback calculations.
 */

import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { registerKeplerBody } from "./index";

let isInitialized = false;

/**
 * Initialize the orbital engine with all celestial bodies
 * This should be called once at application startup
 */
export function initializeOrbitalEngine(): void {
  if (isInitialized) {
    return;
  }

  // Register all bodies with Keplerian elements
  for (const body of SOLAR_SYSTEM_BODIES) {
    // Skip the Sun (it's the reference point)
    if (body.id === "sun") continue;

    // Register body with orbital elements
    if (body.orbit && body.orbit.a > 0) {
      registerKeplerBody(body.id, {
        a: body.orbit.a,
        e: body.orbit.e,
        i: body.orbit.i,
        O: body.orbit.O,
        w: body.orbit.w,
        M0: body.orbit.M0,
        n: body.orbit.n,
      });
    }
  }

  isInitialized = true;
}
