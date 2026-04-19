/**
 * Heliocentric position resolver.
 *
 * The orbital engine returns parent-centered positions for any body with
 * a parentId — see the "Parent-centered satellite position in AU"
 * contract in `analytical/satellites.ts`. Consumers that need a body's
 * true distance to the Sun (e.g. the visual-preset auto-selector) must
 * compose the chain: the body's local position plus the parent's
 * heliocentric position, recursively up to the Sun.
 *
 * This helper lives in the orbital layer on purpose. It operates in
 * physical AU, independent of `AstroPhysics.mapPhysicalPositionToDisplay`
 * — the didactic scale mode remaps render coordinates and would lie
 * about real distances if sampled via scene-graph `getWorldPosition()`.
 */

import * as THREE from "three";
import { orbitalEngine } from "./engine";
import { BODIES_BY_ID } from "../../data/celestialBodies";

export function resolveHeliocentricPositionAU(
  bodyId: string,
  date: Date
): THREE.Vector3 {
  if (bodyId === "sun") return new THREE.Vector3(0, 0, 0);

  const body = BODIES_BY_ID.get(bodyId);
  if (!body) {
    throw new Error(
      `resolveHeliocentricPositionAU: unknown body id "${bodyId}"`
    );
  }

  const result = orbitalEngine.calculatePosition(bodyId, date, body.parentId);
  const accumulator = result.position.clone();

  if (body.parentId && body.parentId !== "sun") {
    accumulator.add(resolveHeliocentricPositionAU(body.parentId, date));
  }

  return accumulator;
}

export function resolveHeliocentricDistanceAU(
  bodyId: string,
  date: Date
): number {
  return resolveHeliocentricPositionAU(bodyId, date).length();
}
