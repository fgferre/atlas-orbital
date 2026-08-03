/**
 * W7 — the single body-level shadow-cone predicate.
 *
 * `resolveEclipseConeGeometry` answers "is `receiver` inside `eclipser`'s
 * shadow right now, and how big is that shadow where it lands" from real
 * heliocentric geometry, in km, independent of scale mode. It is consumed by
 * the per-frame driver in `Planet.tsx` and is the one predicate W8's badge
 * and event scan may read — if the badge and the render ever disagree about
 * whether an eclipse is happening, that is the worst outcome an honesty-first
 * product can produce, so nothing may grow a second copy of this cone.
 *
 * Positions are sampled from the analytical providers
 * (`resolveHeliocentricPositionAU`), NOT from scene-graph
 * `getWorldPosition()` — `heliocentric.ts`'s own JSDoc records that didactic
 * mode would lie about real distances if sampled from the scene graph.
 *
 * ## The cone, and the sign convention
 *
 * With the Sun at the origin, eclipser at distance `d_se` with radius `R_e`,
 * and the receiver's centre projected a distance `x` behind the eclipser
 * along the anti-sun axis:
 *
 *   umbra radius     r_u(x) = R_e − x · (R_s − R_e) / d_se   (signed)
 *   penumbra radius  r_p(x) = R_e + x · (R_s + R_e) / d_se
 *
 * `r_u > 0` means the umbra still reaches `x` — a fragment on the axis sees
 * the Sun fully covered (total). `r_u < 0` is the antumbra — the eclipser's
 * disc fits inside the Sun's (annular), and the on-axis floor is
 * `1 − obscuration` with `obscuration = (θ_e / θ_s)²`, checked against the
 * published 2023-10-14 annular obscuration (~0.905) in
 * `eclipseGeometry.test.ts`.
 *
 * ## Anchors (recomputed 2026-08-03 from this repo's own providers)
 *
 * 2024-04-08T18:18Z, eclipser moon → receiver earth (catalog radii
 * sun 696 340 / moon 1737 / earth 6371, distances from ELP + VSOP at the
 * instant — never from mean distances, which invert the umbra sign):
 * `d_se` 149 463 545 km, `d_er` 359 804 km → umbra **+64.9 km** (the
 * positive sign IS the falsification test that the event renders total),
 * penumbra **3 417.5 km** = 1.968 R_moon. Cross-check that does not pass
 * through the cone arithmetic: the perpendicular distance from Earth's
 * centre to the shadow axis comes out ≈2 192 km against a published gamma
 * of 2 188 km. 2024-05-08T03:22Z must be inactive. Both pinned in
 * `eclipseGeometry.test.ts`, computed from the providers at test time so
 * the anchors cannot rot.
 *
 * ## Disclosed omissions (magnitudes, per the wave's stop rule)
 *
 * - **Oblate umbra** (~0.3%): the eclipser is treated as a sphere of its
 *   catalog `radiusKm`. A flattened eclipser (Jupiter f 0.065, Saturn
 *   f 0.098 — live once their moons carry `eclipsingBodyId`) casts a
 *   slightly elliptical shadow; at the moons' distances the error in the
 *   umbra radius is below 0.3% of the shadow size on the disc.
 * - **Atmospheric enlargement** (~2%): Earth's umbra is observed ~2%
 *   larger than the geometric cone (Danjon rule). Not modelled.
 * - **Limb-darkened penumbra profile**: the penumbra ramp is linear in
 *   axis distance; the true profile follows the Sun's limb darkening.
 *   Sub-pixel at every reachable zoom.
 *
 * Light-travel time is also not modelled: eclipse times are geometric.
 * At Jupiter that discrepancy reaches ~17 minutes across Earth's orbit —
 * which is literally how Rømer measured the speed of light in 1676.
 */

import * as THREE from "three";

import { AU_IN_KM } from "./astrophysics";

export interface EclipseConeBodies {
  /** Sun's radius in km (catalog `radiusKm` of the light source). */
  sunRadiusKm: number;
  /** Eclipser's radius in km (catalog `radiusKm`; sphere — see omissions). */
  eclipserRadiusKm: number;
  /** Receiver's radius in km (catalog `radiusKm`). */
  receiverRadiusKm: number;
}

/**
 * Body-level cone geometry at the receiver, in km. All fields are
 * scale-mode independent — this is AU-domain physics, not render mapping.
 */
export interface EclipseConeGeometry {
  /**
   * True when the receiver's disc overlaps the penumbra: the shadow axis
   * passes within `receiverRadiusKm + penumbraRadiusKm` of the receiver's
   * centre AND the receiver is on the anti-sun side of the eclipser.
   * Keyed off geometry alone — Earth's shadow on the Moon exists whether
   * or not Earth's mesh is mounted.
   */
  active: boolean;
  /** Signed umbra radius at the receiver's axis position (km). > 0 = total possible, < 0 = antumbra (annular). */
  umbraRadiusKm: number;
  /** Penumbra radius at the receiver's axis position (km). */
  penumbraRadiusKm: number;
  /** Perpendicular distance from the receiver's centre to the shadow axis (km). */
  axisDistanceKm: number;
  /**
   * On-axis light floor in [0, 1]. 0 while the umbra reaches the receiver
   * (total); `1 − (θ_e/θ_s)²` in the antumbra, so an annular eclipse
   * renders annular instead of black.
   */
  minShadow: number;
  /** Centre-to-centre eclipser → receiver distance (km). */
  eclipserDistanceKm: number;
}

/**
 * Render-side configuration for the shader driver: the cone above pushed
 * through a **similarity transform anchored at the receiver's centre**.
 *
 * With `s = receiverRenderRadius / receiverRadiusKm` (world units per km),
 * the synthetic eclipser position is `receiverWorld + s·(E − R)`, the
 * synthetic Sun is `receiverWorld − s·R` (the Sun is the AU-frame origin),
 * and every radius scales by `s`. **All three bodies must be mapped** —
 * that is what preserves every angular relationship per fragment and keeps
 * the shader's segment-distance machinery valid unmodified. The first W7
 * cut mapped only the eclipser and aimed the shader ray at the RENDER Sun
 * (world origin); in didactic mode the render Sun is not
 * similarity-consistent — the synthetic Moon lands almost exactly at the
 * render Sun's distance, the per-fragment offset coefficient collapses
 * from ~1 to ~0.003, and a solar eclipse dims Earth's whole disc instead
 * of sweeping a localized spot (found by the post-ship adversarial
 * review, reproduced numerically with these resolvers). In realistic mode
 * `s = KM_TO_3D_UNITS`, so the synthetic Sun IS the world origin and the
 * transform degenerates to the identity: "realistic is scale-faithful"
 * holds by construction. Pinned in `eclipseGeometry.test.ts`.
 */
export interface EclipseRenderConfig {
  /** Synthetic eclipser position in render world units. */
  eclipserPosWorld: THREE.Vector3;
  /**
   * Synthetic Sun position in render world units — the shader's ray
   * target. Equals the world origin exactly in realistic mode.
   */
  sunPosWorld: THREE.Vector3;
  /** Umbra radius in world units, clamped ≥ 0 (the annular floor moves to `minShadow`). */
  umbraRadiusWu: number;
  /** Penumbra radius in world units. */
  penumbraRadiusWu: number;
  /** Segment length for the shader's fragment→sun ray; > 2·s·|E − R| so the segment always reaches past the eclipser. */
  vrScaleWu: number;
  /** Copied from the cone: on-axis light floor. */
  minShadow: number;
  /** Copied from the cone predicate. */
  active: boolean;
}

export const createEclipseConeGeometry = (): EclipseConeGeometry => ({
  active: false,
  umbraRadiusKm: 0,
  penumbraRadiusKm: 0,
  axisDistanceKm: 0,
  minShadow: 0,
  eclipserDistanceKm: 0,
});

export const createEclipseRenderConfig = (): EclipseRenderConfig => ({
  eclipserPosWorld: new THREE.Vector3(),
  sunPosWorld: new THREE.Vector3(),
  umbraRadiusWu: 0,
  penumbraRadiusWu: 0,
  vrScaleWu: 0,
  minShadow: 0,
  active: false,
});

// Module-scope scratch — the driver calls this per receiver per resolve
// tick, and this file allocates nothing on that path.
const TMP_ECLIPSER_KM = new THREE.Vector3();
const TMP_RECEIVER_KM = new THREE.Vector3();
const TMP_REL_KM = new THREE.Vector3();
const TMP_AXIS = new THREE.Vector3();
const TMP_PERP = new THREE.Vector3();

/**
 * The single shadow-cone predicate. Positions are heliocentric ecliptic
 * vectors in AU (Sun at the origin) from the analytical providers; radii
 * come from the catalog. Writes into `out` and returns it — allocates
 * nothing.
 */
export const resolveEclipseConeGeometry = (
  eclipserPosAU: THREE.Vector3,
  receiverPosAU: THREE.Vector3,
  bodies: EclipseConeBodies,
  out: EclipseConeGeometry
): EclipseConeGeometry => {
  const { sunRadiusKm, eclipserRadiusKm, receiverRadiusKm } = bodies;

  TMP_ECLIPSER_KM.copy(eclipserPosAU).multiplyScalar(AU_IN_KM);
  TMP_RECEIVER_KM.copy(receiverPosAU).multiplyScalar(AU_IN_KM);

  const sunEclipserKm = TMP_ECLIPSER_KM.length();
  TMP_REL_KM.copy(TMP_RECEIVER_KM).sub(TMP_ECLIPSER_KM);
  const eclipserDistanceKm = TMP_REL_KM.length();

  out.eclipserDistanceKm = eclipserDistanceKm;

  if (sunEclipserKm <= 0 || eclipserDistanceKm <= 0) {
    out.active = false;
    out.umbraRadiusKm = 0;
    out.penumbraRadiusKm = 0;
    out.axisDistanceKm = 0;
    out.minShadow = 1;
    return out;
  }

  // Anti-sun shadow axis through the eclipser.
  TMP_AXIS.copy(TMP_ECLIPSER_KM).divideScalar(sunEclipserKm);
  const alongAxisKm = TMP_REL_KM.dot(TMP_AXIS);
  TMP_PERP.copy(TMP_AXIS).multiplyScalar(alongAxisKm);
  const axisDistanceKm = TMP_PERP.sub(TMP_REL_KM).length();

  out.axisDistanceKm = axisDistanceKm;

  if (alongAxisKm <= 0) {
    // Receiver is sunward of the eclipser — no shadow can reach it.
    out.active = false;
    out.umbraRadiusKm = 0;
    out.penumbraRadiusKm = 0;
    out.minShadow = 1;
    return out;
  }

  out.umbraRadiusKm =
    eclipserRadiusKm -
    (alongAxisKm * (sunRadiusKm - eclipserRadiusKm)) / sunEclipserKm;
  out.penumbraRadiusKm =
    eclipserRadiusKm +
    (alongAxisKm * (sunRadiusKm + eclipserRadiusKm)) / sunEclipserKm;

  // Angular radii from the receiver's centre: eclipser vs Sun. Their
  // squared ratio is the on-axis obscuration when the eclipser's disc
  // fits inside the Sun's (annular); the floor is what is NOT covered.
  if (out.umbraRadiusKm >= 0) {
    out.minShadow = 0;
  } else {
    const sunReceiverKm = TMP_RECEIVER_KM.length();
    const angularEclipser = eclipserRadiusKm / eclipserDistanceKm;
    const angularSun = sunRadiusKm / Math.max(sunReceiverKm, 1e-9);
    const obscuration = Math.min(
      1,
      (angularEclipser / Math.max(angularSun, 1e-12)) ** 2
    );
    out.minShadow = THREE.MathUtils.clamp(1 - obscuration, 0, 1);
  }

  out.active =
    axisDistanceKm < receiverRadiusKm + out.penumbraRadiusKm &&
    out.penumbraRadiusKm > 0;

  return out;
};

/**
 * Similarity transform of the cone into render space, anchored at the
 * receiver's centre. Allocation-free: writes into `out` and returns it.
 * See `EclipseRenderConfig` for the invariants; in realistic mode
 * `s = KM_TO_3D_UNITS` exactly (spherical receiver), so this is the
 * identity mapping of the physical configuration.
 */
export const resolveEclipseRenderConfig = (
  cone: EclipseConeGeometry,
  eclipserPosAU: THREE.Vector3,
  receiverPosAU: THREE.Vector3,
  receiverWorldPos: THREE.Vector3,
  receiverRenderRadius: number,
  receiverRadiusKm: number,
  out: EclipseRenderConfig
): EclipseRenderConfig => {
  const s = receiverRenderRadius / Math.max(receiverRadiusKm, 1e-9);

  // s·(E − R), km → world units, anchored at the receiver's render position.
  TMP_REL_KM.copy(eclipserPosAU)
    .sub(receiverPosAU)
    .multiplyScalar(AU_IN_KM * s);
  out.eclipserPosWorld.copy(receiverWorldPos).add(TMP_REL_KM);

  // s·(S − R) with the Sun at the AU-frame origin: the synthetic Sun the
  // shader ray must aim at. Reusing the render Sun (world origin) here is
  // only correct in realistic mode — in didactic mode it collapses the
  // per-fragment geometry (see the interface JSDoc).
  TMP_REL_KM.copy(receiverPosAU).multiplyScalar(AU_IN_KM * s);
  out.sunPosWorld.copy(receiverWorldPos).sub(TMP_REL_KM);

  out.umbraRadiusWu = Math.max(cone.umbraRadiusKm, 0) * s;
  out.penumbraRadiusWu = cone.penumbraRadiusKm * s;
  out.vrScaleWu = 2.5 * s * cone.eclipserDistanceKm;
  out.minShadow = cone.minShadow;
  out.active = cone.active;

  return out;
};
