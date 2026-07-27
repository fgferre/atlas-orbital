/**
 * Reference-frame rules for the satellite sub-tree of `Planet.tsx`.
 *
 * Pure logic lives here (and not inside `Planet.tsx`) so the Fast Refresh
 * rule (`react-refresh/only-export-components`) stays clean and the
 * invariant can be unit-tested against the real functions the scene graph
 * uses — same split as `cameraNearPlane.ts` / `hygMeshFadeRamp.ts`.
 */

import { hasAnalyticalEphemeris } from "../../lib/orbital";

/**
 * Does this satellite's POSITION SOURCE express it in the parent's
 * equatorial plane (and therefore need the parent's pole quaternion
 * applied by the scene graph)?
 *
 * The discriminator is the frame of the source, never the body id. Every
 * analytical branch of the orbital engine returns **J2000 mean-ecliptic,
 * parent-centered** vectors — `src/lib/orbital/analytical/satellites.ts:10-11`
 * says so verbatim ("so no body-equatorial rotation is needed at runtime"),
 * and the same holds for `moonElp`, `vsop87Planets`, `plutoMeeus` and
 * `asteroids`. Nesting those children under the parent's pole quaternion
 * rotates them a SECOND time; measured at the 2025-01-01 epoch that pushed
 * Deimos 24.4°, Titan 14.4°, Iapetus 27.9° and Oberon 80.4° off the engine
 * vector.
 *
 * The satellites that still need the rotation are the ones served by the
 * legacy Keplerian elements in `src/data/celestialBodies.ts`. W6 stage B cut
 * that list to the TNO moons **Vanth and Weywot**: Charon and Triton were
 * given Horizons-derived ecliptic elements and left it.
 *
 * Charon is worth remembering as the shape of the gap. Its legacy `i: 0.0`
 * only made sense against Pluto's equator, and the inversion confirms it —
 * the real ecliptic inclination is 112.89°, which is exactly where Pluto's
 * IAU pole puts its equator. The number was never wrong, it just declared no
 * frame, which is a data gap rather than a modelled property. Vanth and
 * Weywot have no measured orbit to invert, so for them the gap stands.
 * `hasAnalyticalEphemeris` is the honest, derivable stand-in until those
 * entries either declare a frame or get ecliptic-J2000 elements like the
 * analytical families; an unregistered/unknown satellite conservatively
 * keeps the legacy behaviour.
 */
export function satelliteUsesParentEquatorialFrame(
  satelliteId: string
): boolean {
  return !hasAnalyticalEphemeris(satelliteId);
}
