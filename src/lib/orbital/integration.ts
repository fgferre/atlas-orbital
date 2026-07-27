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
import { BODIES_BY_ID } from "../../data/celestialBodies";
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
  const display = AstroPhysics.mapPhysicalPositionToDisplay({
    body,
    parentBody,
    positionAU: result.position,
    scaleMode,
  });

  return applyBinaryBarycentreOffset({ body, date, scaleMode, display });
}

/**
 * Pairs where the primary visibly orbits a barycentre **outside its own
 * surface**, so drawing it at the series position denies the defining fact of
 * the system.
 *
 * Pluto is the only entry, and it is a table rather than a branch on
 * `body.id === "pluto"` because the discriminator is a physical property with
 * a measured value, not a special case.
 */
const BINARY_BARYCENTRE: Record<
  string,
  { companionId: string; companionMassFraction: number }
> = {
  pluto: {
    companionId: "charon",
    /**
     * `BODY901_GM / (BODY999_GM + BODY901_GM)` from NAIF `gm_de440.tpc`
     * = 105.87999 / (869.61382 + 105.87999) = 0.108540 — written as the
     * division so both sourced numbers stay visible.
     *
     * Independent check, per standing law 3: multiplied by Charon's
     * fixture-derived semi-major axis (19 594 km) this gives a **2 127 km**
     * offset, or **1.79 Pluto radii** — reproducing figures that were computed
     * elsewhere, from published masses, before this constant existed.
     */
    companionMassFraction:
      105.8799888601881 / (869.6138177608748 + 105.8799888601881),
  },
};

/**
 * Displace a binary primary from the barycentre onto its own centre.
 *
 * **This is a modelled convention, not a measured correction, and it must not
 * be read as improved heliocentric accuracy.** Meeus Ch. 37 — the series that
 * places Pluto — does not say whether it returns Pluto's centre or the
 * Pluto-Charon barycentre, and no fixture in this repo can adjudicate that:
 * its own stated accuracy is ~30 000 km in the radius vector, **fourteen
 * times larger** than the 2 127 km offset applied here. So the two readings
 * are indistinguishable to every check available.
 *
 * It is nonetheless a strict improvement under both of them. If the series
 * returns the barycentre, this puts Pluto where it belongs. If it returns
 * Pluto's centre, this introduces an error an order of magnitude below the
 * series' own noise floor, and buys a **relative** geometry the app already
 * asserts in prose: Charon's own curiosity text tells the reader the two
 * bodies orbit a point in open space, while the scene drew Pluto pinned
 * motionless at the centre.
 *
 * The offset is taken from the companion's **rendered** display vector rather
 * than from a second evaluation of its orbit. That is what keeps Pluto's
 * wobble and Charon's position two views of one number instead of two models
 * that can drift apart — and it makes the offset inherit didactic
 * exaggeration for free, without which Pluto's circle would collapse to
 * sub-pixel while Charon orbited at an exaggerated radius, breaking the very
 * relative geometry being fixed.
 */
function applyBinaryBarycentreOffset({
  body,
  date,
  scaleMode,
  display,
}: {
  body: CelestialBody;
  date: Date;
  scaleMode: "realistic" | "didactic";
  display: THREE.Vector3;
}): THREE.Vector3 {
  const offset = resolveBinaryBarycentreOffset({ body, date, scaleMode });
  // r_primary = barycentre + offset. The companion is a child of this body's
  // group in the scene graph, so it rides the same displacement and the two
  // end up on opposite sides of a barycentre that itself stays put.
  return offset ? display.add(offset) : display;
}

/**
 * The primary's displacement from the barycentre, in display units, or `null`
 * for the overwhelming majority of bodies that are not half of a binary.
 *
 * Exported because the orbit-line invariant needs it. `getOrbitalDisplayOrbitPoints`
 * draws the **barycentre's** ellipse — that is what the heliocentric series
 * returns, and for a binary it is the honest curve to draw — so the primary
 * genuinely sits off its own orbit line, by exactly this much and never more.
 * `orbitAlignment.test.ts` therefore admits this vector rather than a widened
 * tolerance, which keeps the invariant able to catch a real misalignment on
 * Pluto instead of going blind there.
 */
export function resolveBinaryBarycentreOffset({
  body,
  date,
  scaleMode = "realistic",
}: {
  body: CelestialBody;
  date: Date;
  scaleMode?: "realistic" | "didactic";
}): THREE.Vector3 | null {
  const pair = BINARY_BARYCENTRE[body.id];
  if (!pair) return null;

  const companion = BODIES_BY_ID.get(pair.companionId);
  if (!companion) return null;

  return resolveOrbitalDisplayPosition({
    body: companion,
    parentBody: body,
    date,
    scaleMode,
  }).multiplyScalar(-pair.companionMassFraction);
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
