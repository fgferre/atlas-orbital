/**
 * Orbital Engine Setup
 *
 * Bridges the existing celestialBodies.ts data with the orbital engine.
 * Registers all bodies with their Keplerian elements for fallback calculations.
 */

import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { registerKeplerBody } from "./index";
import { getSatelliteOsculatingElements } from "./analytical/satellites";
import { J2000_JD } from "./time";

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

    /**
     * An analytical satellite registers its **own** elements as its fallback,
     * not the catalog's.
     *
     * `keplerProvider` declares `outputFrame = "J2000_ECLIPTIC"`, and for these
     * twenty bodies `body.orbit` is not that: it holds the published
     * parent-referred figures (Tethys `i: 1.12` against a true ecliptic 27.14),
     * and thirteen of them pair that with a fabricated `O: 0, w: 0, M0: 0`. The
     * scene used to absorb the mismatch by mounting these satellites inside the
     * parent's pole quaternion — but `satelliteUsesParentEquatorialFrame` is
     * registry-driven and date-blind, so it no longer does.
     *
     * The consequence was only visible outside each family's validity window,
     * where `engine.ts` drops to this fallback, and it was severe and *drawn*:
     * scrubbing to 2035 laid Miranda's orbit **104.6°** over, flat onto the
     * ecliptic, taking the drawn orbit line with it — Uranus's sideways moon
     * system, the single most distinctive thing about the planet, collapsing
     * into an ordinary flat one. Ariel/Umbriel/Titania/Oberon ~98°, the
     * Saturnians ~28°, Phobos 26.3°.
     *
     * Reading the analytical block instead fixes all twenty at once and is the
     * cheap way rather than the thorough-looking one: the same numbers already
     * exist there, so nothing is copied into a second home that can drift, and
     * `body.orbit` stays exactly as published for the panel to display.
     * `getSatelliteOsculatingElements` at J2000 does the epoch re-reference
     * (`M0 + n·(J2000 − epochJD)`) with the body's own calibrated rate, which
     * is what makes the fallback geometrically *identical* to the analytical
     * path — measured 0.0000° across all twenty, so crossing the window edge
     * changes the disclosed accuracy and nothing a viewer can see.
     */
    const derived = getSatelliteOsculatingElements(body.id, J2000_JD);
    if (derived) {
      registerKeplerBody(body.id, {
        a: derived.a,
        e: derived.e,
        i: derived.i,
        O: derived.O,
        w: derived.w,
        M0: derived.M,
        n: derived.n,
      });
    } else if (body.orbit && body.orbit.a > 0) {
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
