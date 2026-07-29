/**
 * Physical umbra/penumbra cone geometry — the single body-level shadow-cone
 * predicate, consumed by the per-frame eclipse driver (`Planet.tsx`).
 *
 * ## Why this file exists (W7, 2026-07-29)
 *
 * The eclipse shader previously compared each fragment's distance from the
 * eclipser against two FIXED ratios of the eclipser's own radius —
 * `UMBRA0 = 0.04`, `PENUMBRA0 = 1.7` — regardless of how far the eclipser
 * actually was from the Sun or the receiver. That ignores the Sun's finite
 * angular size, which is the entire reason umbra and penumbra cones exist
 * (a point-source sun would cast one perfectly sharp shadow with no
 * penumbra at all). The fixed-ratio cone fires far too eagerly — closer to
 * "the Moon is roughly aligned with Earth" (happens near every new moon)
 * than "the Moon's shadow actually reaches Earth's surface" (~8.6% of new
 * moons produce a solar eclipse somewhere on Earth). This module replaces
 * the ratios with the standard similar-triangles umbra/penumbra
 * construction, so the cone only fires when the real geometry says it does.
 *
 * ## The construction
 *
 * Sun (radius `R_s`), eclipser (radius `R_e`, distance `d_se` from the Sun),
 * receiver (distance `d_er` from the eclipser, roughly along the same axis).
 * The umbra is a CONVERGING cone (tangent lines cross behind the eclipser);
 * the penumbra is a DIVERGING cone (tangent lines cross in front of the
 * Sun). Similar triangles give the cross-section radius of each cone at the
 * receiver's distance:
 *
 * ```
 * umbraRadiusKm    = R_e − d_er · (R_s − R_e) / d_se
 * penumbraRadiusKm = R_e + d_er · (R_s + R_e) / d_se
 * ```
 *
 * `umbraRadiusKm` is SIGNED. Positive means the true umbra (totality) still
 * has cross-section at the receiver's distance. Negative means the receiver
 * is beyond the umbra's apex, inside the antumbra — an annular eclipse,
 * where a ring of direct sunlight always survives no matter how well
 * aligned the bodies are. `|umbraRadiusKm|` is the antumbra's own radius at
 * that point (same linear cone, mirrored past the apex).
 *
 * ## Independent check (standing law 3)
 *
 * `eclipseGeometry.test.ts` pins this against the 2024-04-08T18:18Z total
 * solar eclipse using this repo's own ELP/VSOP providers: at that instant
 * `d_se` (Sun→Moon) = 149,463,545 km and `d_er` (Moon→Earth) = 359,804 km,
 * which this formula turns into umbra +64.9 km / penumbra 3,417.5 km —
 * matching the published event (total, not annular) and cross-checked by a
 * SEPARATE calculation that does not reuse this formula: the perpendicular
 * distance from Earth's centre to the Sun–Moon axis (this module's
 * `axisDistanceKm`, i.e. eclipse-literature "gamma") comes out ≈2,192 km
 * against a published gamma of 2,188 km for that event.
 *
 * ## What this file deliberately does NOT do
 *
 * No per-fragment shading. That machinery (perpendicular distance from a
 * SURFACE POINT to the fragment→Sun ray, extended past the eclipser) stays
 * in the GLSL (`eclipseShaderPatch.ts`) — it needs a fragment position this
 * module never has. This file answers only the BODY-level question: how
 * big are the two cones at the receiver's distance, is the receiver's disc
 * anywhere inside the penumbra right now, and — if the umbra doesn't reach
 * — how bright is the annular floor.
 */

import * as THREE from "three";
import { resolveHeliocentricPositionAU } from "./orbital/heliocentric";
import { BODIES_BY_ID } from "../data/celestialBodies";

/** Perpendicular-distance scratch, reused across calls — see the file's zero-allocation contract below. */
const TMP_AXIS = new THREE.Vector3();
const TMP_TO_RECEIVER = new THREE.Vector3();
const TMP_TO_ECLIPSER = new THREE.Vector3();
const TMP_CROSS = new THREE.Vector3();
const TMP_ER = new THREE.Vector3();
const TMP_SR = new THREE.Vector3();

export interface EclipseConeRadiiInput {
  /** Sun's physical radius, km. */
  sunRadiusKm: number;
  /** Eclipsing (shadow-casting) body's physical radius, km. */
  eclipserRadiusKm: number;
  /** Distance from the Sun to the eclipser, km. */
  sunToEclipserDistanceKm: number;
  /** Distance from the eclipser to the receiver, km. */
  eclipserToReceiverDistanceKm: number;
}

export interface EclipseConeRadii {
  /** Signed. Positive = true umbra reaches the receiver (possible totality). Negative = antumbra (annular). */
  umbraRadiusKm: number;
  /** Always positive — the outer edge beyond which no shadowing occurs at all. */
  penumbraRadiusKm: number;
}

/**
 * The similar-triangles umbra/penumbra construction described in this
 * file's header. Pure function of four scalars — this is the part
 * `eclipseGeometry.test.ts` pins against the recomputed 2024-04-08 anchor.
 */
export const resolveEclipseConeRadiiKm = ({
  sunRadiusKm,
  eclipserRadiusKm,
  sunToEclipserDistanceKm,
  eclipserToReceiverDistanceKm,
}: EclipseConeRadiiInput): EclipseConeRadii => {
  const umbraRadiusKm =
    eclipserRadiusKm -
    (eclipserToReceiverDistanceKm * (sunRadiusKm - eclipserRadiusKm)) /
      sunToEclipserDistanceKm;
  const penumbraRadiusKm =
    eclipserRadiusKm +
    (eclipserToReceiverDistanceKm * (sunRadiusKm + eclipserRadiusKm)) /
      sunToEclipserDistanceKm;
  return { umbraRadiusKm, penumbraRadiusKm };
};

/**
 * Annular floor — the fraction of the Sun's direct light that survives
 * exactly on-axis when the eclipser's disc is angularly smaller than the
 * Sun's, seen from the receiver. `1 − (θ_eclipser / θ_sun)²`: the area
 * ratio of two circles subtending those angular radii, i.e. how much of
 * the Sun's disc area the eclipser fails to cover even at best alignment.
 * Independent check (standing law 3): the 2023-10-14 annular eclipse's
 * published obscuration is ≈0.90 of the Sun's area, i.e. this should
 * return ≈0.10 there (`eclipseGeometry.test.ts`).
 *
 * Only meaningful when the true umbra does not reach the receiver
 * (`resolveEclipseConeRadiiKm(...).umbraRadiusKm < 0`); callers gate on
 * that sign rather than this function re-deriving it, since both are
 * cheap scalar divisions of the same inputs and re-deriving would just be
 * a second chance to drift from the first.
 */
export const resolveAnnularMinShadow = ({
  sunRadiusKm,
  eclipserRadiusKm,
  sunToReceiverDistanceKm,
  eclipserToReceiverDistanceKm,
}: {
  sunRadiusKm: number;
  eclipserRadiusKm: number;
  /** Distance from the Sun to the RECEIVER, km (not to the eclipser). */
  sunToReceiverDistanceKm: number;
  eclipserToReceiverDistanceKm: number;
}): number => {
  const eclipserAngularRadius = eclipserRadiusKm / eclipserToReceiverDistanceKm;
  const sunAngularRadius = sunRadiusKm / sunToReceiverDistanceKm;
  const ratio = eclipserAngularRadius / sunAngularRadius;
  return Math.max(0, 1 - ratio * ratio);
};

export interface EclipseConeGeometryInput {
  /** AU, heliocentric. Always the origin in this app's frame, but accepted explicitly rather than assumed. */
  sunPositionAU: THREE.Vector3;
  eclipserPositionAU: THREE.Vector3;
  receiverPositionAU: THREE.Vector3;
  sunRadiusKm: number;
  eclipserRadiusKm: number;
  receiverRadiusKm: number;
}

export interface EclipseConeGeometry {
  umbraRadiusKm: number;
  penumbraRadiusKm: number;
  /** Perpendicular distance from the receiver's centre to the Sun–eclipser axis, km ("gamma"). */
  axisDistanceKm: number;
  /** `axisDistanceKm < penumbraRadiusKm + receiverRadiusKm` — some part of the receiver's disc is inside the penumbra. */
  active: boolean;
  /** 0 when the true umbra reaches the receiver; the annular floor otherwise. Only meaningful when `active`. */
  minShadow: number;
}

const AU_IN_KM = 149597870.7;

const emptyGeometry = (): EclipseConeGeometry => ({
  umbraRadiusKm: 0,
  penumbraRadiusKm: 0,
  axisDistanceKm: 0,
  active: false,
  minShadow: 0,
});

/**
 * Full body-level cone geometry from real AU positions. Accepts an
 * out-parameter so the per-frame driver (`Planet.tsx`) can call this every
 * frame for the handful of on-screen eclipse-capable bodies without
 * allocating — pass the same object back on the next call. Omit `out` in
 * tests, where one allocation per assertion is irrelevant.
 */
export const resolveEclipseConeGeometry = (
  input: EclipseConeGeometryInput,
  out: EclipseConeGeometry = emptyGeometry()
): EclipseConeGeometry => {
  const {
    sunPositionAU,
    eclipserPositionAU,
    receiverPositionAU,
    sunRadiusKm,
    eclipserRadiusKm,
    receiverRadiusKm,
  } = input;

  TMP_SR.copy(receiverPositionAU).sub(sunPositionAU);
  TMP_ER.copy(receiverPositionAU).sub(eclipserPositionAU);
  TMP_AXIS.copy(eclipserPositionAU).sub(sunPositionAU);

  const sunToEclipserDistanceKm = TMP_AXIS.length() * AU_IN_KM;
  const eclipserToReceiverDistanceKm = TMP_ER.length() * AU_IN_KM;
  const sunToReceiverDistanceKm = TMP_SR.length() * AU_IN_KM;

  const { umbraRadiusKm, penumbraRadiusKm } = resolveEclipseConeRadiiKm({
    sunRadiusKm,
    eclipserRadiusKm,
    sunToEclipserDistanceKm,
    eclipserToReceiverDistanceKm,
  });

  // Perpendicular distance from the receiver to the line through the Sun
  // and the eclipser: |(R−S) × normalize(E−S)|. `TMP_AXIS` still holds
  // (E−S) in AU from above; normalize a copy rather than mutating it, since
  // its un-normalized length already fed `sunToEclipserDistanceKm`.
  TMP_TO_RECEIVER.copy(receiverPositionAU).sub(sunPositionAU);
  TMP_TO_ECLIPSER.copy(TMP_AXIS).normalize();
  TMP_CROSS.copy(TMP_TO_RECEIVER).cross(TMP_TO_ECLIPSER);
  const axisDistanceKm = TMP_CROSS.length() * AU_IN_KM;

  const active = axisDistanceKm < penumbraRadiusKm + receiverRadiusKm;
  const minShadow =
    active && umbraRadiusKm < 0
      ? resolveAnnularMinShadow({
          sunRadiusKm,
          eclipserRadiusKm,
          sunToReceiverDistanceKm,
          eclipserToReceiverDistanceKm,
        })
      : 0;

  out.umbraRadiusKm = umbraRadiusKm;
  out.penumbraRadiusKm = penumbraRadiusKm;
  out.axisDistanceKm = axisDistanceKm;
  out.active = active;
  out.minShadow = minShadow;
  return out;
};

/**
 * Render-space similarity transform (third-round "actual heart of the
 * wave"). `renderUnitsPerKm` is `receiverRenderRadius / receiverRadiusKm` —
 * how many world units this specific receiver's render occupies per real
 * km, which is `KM_TO_3D_UNITS` (a constant) in realistic mode and the
 * body's own didactic inflation factor in didactic mode. Scaling the two
 * cone radii by the SAME factor that scales the receiver's own radius
 * preserves every angular relationship the per-fragment shader math
 * depends on, and degenerates to the identity in realistic mode by
 * construction (no separate "realistic is scale-faithful" test needed).
 */
export const scaleEclipseRadiiToRenderUnits = (
  radii: { umbraRadiusKm: number; penumbraRadiusKm: number },
  renderUnitsPerKm: number
): { umbraRadiusRender: number; penumbraRadiusRender: number } => ({
  umbraRadiusRender: radii.umbraRadiusKm * renderUnitsPerKm,
  penumbraRadiusRender: radii.penumbraRadiusKm * renderUnitsPerKm,
});

/**
 * Body-id convenience wrapper around {@link resolveEclipseConeGeometry} —
 * the ONE predicate this wave promises: whatever this function returns is
 * what both the render driver and (W8, not this wave) the eclipse badge
 * must agree on. Resolves AU positions itself via
 * `resolveHeliocentricPositionAU`, never scene-graph `getWorldPosition()`
 * (see that module's own header for why: the didactic remap would lie
 * about real distances).
 *
 * Returns `null` if either id is unknown to the catalog, so tests and
 * callers can fail loudly rather than silently computing garbage from
 * `undefined` radii.
 */
export const resolveBodyEclipseConeGeometry = (
  receiverId: string,
  eclipserId: string,
  date: Date
): EclipseConeGeometry | null => {
  const receiver = BODIES_BY_ID.get(receiverId);
  const eclipser = BODIES_BY_ID.get(eclipserId);
  const sun = BODIES_BY_ID.get("sun");
  if (!receiver || !eclipser || !sun) return null;

  return resolveEclipseConeGeometry({
    sunPositionAU: resolveHeliocentricPositionAU("sun", date),
    eclipserPositionAU: resolveHeliocentricPositionAU(eclipserId, date),
    receiverPositionAU: resolveHeliocentricPositionAU(receiverId, date),
    sunRadiusKm: sun.radiusKm,
    eclipserRadiusKm: eclipser.radiusKm,
    receiverRadiusKm: receiver.radiusKm,
  });
};
