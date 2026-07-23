/**
 * Reference-frame rules for the satellite sub-tree of `Planet.tsx`.
 *
 * Pure logic lives here (and not inside `Planet.tsx`) so the Fast Refresh
 * rule (`react-refresh/only-export-components`) stays clean and the
 * invariant can be unit-tested against the real functions the scene graph
 * uses — same split as `cameraNearPlane.ts` / `hygMeshFadeRamp.ts`.
 */

import * as THREE from "three";
import { type CelestialBody, AstroPhysics } from "../../lib/astrophysics";
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
 * legacy Keplerian elements in `src/data/celestialBodies.ts` (Charon,
 * Triton, and the `axialTilt: 0` pairs Vanth/Weywot). Those element sets are
 * de-facto parent-EQUATORIAL — Charon's `i: 0.0` only makes sense against
 * Pluto's equator (≈112.8° from the ecliptic) — but they declare no frame at
 * all, which is a data gap, not a modelled property.
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

/**
 * Rotation taking scene up (ecliptic north) to the body's spin axis, from
 * IAU pole data when available and from `axialTilt` otherwise.
 */
export function computePoleOrientationQuaternion(
  body: CelestialBody
): THREE.Quaternion {
  if (body.poleRA !== undefined && body.poleDec !== undefined) {
    // Get pole direction in Ecliptic space
    const poleDir = AstroPhysics.equatorialToEcliptic(
      body.poleRA,
      body.poleDec
    );

    // Default Up is (0, 1, 0) in our scene (Ecliptic North)
    const defaultUp = new THREE.Vector3(0, 1, 0);

    // Create quaternion to rotate Up to Pole Direction
    return new THREE.Quaternion().setFromUnitVectors(defaultUp, poleDir);
  }

  // Fallback to simple axial tilt (around Z axis)
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, -(body.axialTilt || 0) * (Math.PI / 180))
  );
}
