/**
 * Orbital Engine Integration
 *
 * Bridges the orbital engine with the display/rendering pipeline.
 * Replaces AstroPhysics.calculatePhysicalLocalPositionAU with orbital engine.
 */

import * as THREE from "three";
import { orbitalEngine } from "./engine";
import { AstroPhysics } from "../astrophysics";
import type { CelestialBody } from "../astrophysics";
import { generateOsculatingEllipsePoints } from "./keplerProvider";

/**
 * Calculate position using orbital engine with display scaling
 *
 * This replaces AstroPhysics.resolveDisplayLocalPosition by:
 * 1. Using orbital engine for position calculation (AU)
 * 2. Applying didactic scaling if needed
 * 3. Returning Three.js coordinates
 */
export function resolveOrbitalDisplayPosition({
  body,
  parentBody = null,
  date,
  scaleMode = "realistic",
}: {
  body: CelestialBody;
  parentBody?: CelestialBody | null;
  date: Date;
  scaleMode?: "realistic" | "didactic";
}): THREE.Vector3 {
  const result = orbitalEngine.calculatePosition(body.id, date, parentBody?.id);
  return AstroPhysics.mapPhysicalPositionToDisplay({
    body,
    parentBody,
    positionAU: result.position,
    scaleMode,
  });
}

/**
 * Generate orbit points using osculating ellipse
 *
 * As per the plan: "para corpos com provedor analítico, gerar a órbita exibida
 * a partir de uma elipse osculante do instante atual"
 *
 * Uses parametric ellipse generation by sweeping true anomaly from 0 to 2π,
 * rather than time-stepping through the orbital period.
 */
export function getOrbitalDisplayOrbitPoints({
  body,
  parentBody = null,
  date,
  segments = 128,
  scaleMode = "realistic",
}: {
  body: CelestialBody;
  parentBody?: CelestialBody | null;
  date: Date;
  segments?: number;
  scaleMode?: "realistic" | "didactic";
}): THREE.Vector3[] {
  const osculatingElements = orbitalEngine.getOsculatingElements(body.id, date);

  if (!osculatingElements) {
    console.warn(
      `[integration] No osculating elements available for ${body.id}`
    );
    return [];
  }

  // Generate points from osculating ellipse using parametric sweep
  const pointsAU = generateOsculatingEllipsePoints(
    osculatingElements,
    segments
  );

  return pointsAU.map((pointAU) =>
    AstroPhysics.mapPhysicalPositionToDisplay({
      body,
      parentBody,
      positionAU: pointAU,
      scaleMode,
    })
  );
}
