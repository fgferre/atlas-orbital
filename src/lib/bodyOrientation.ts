/**
 * Body orientation — one pole, one spin, three layers.
 *
 * This module is the **single** source of body orientation in the app. It
 * absorbed `computePoleOrientationQuaternion` from
 * `src/components/canvas/moonSceneFrame.ts` (deleted in the same commit, per
 * the wave's standing law 1) so `Planet.tsx`, `PlanetModel.tsx` and the
 * satellite mount all read one function instead of three.
 *
 * ## Why three layers and not one
 *
 * The obvious shape — "a function that returns a `THREE.Quaternion`" — is
 * mislayered for its own consumers. IAU pole tables are published in the ICRF
 * and the orbital engine works in the **ecliptic J2000 astro frame** (z-up),
 * while the scene graph is **three.js Y-up**. A function that hands back a
 * scene quaternion cannot be used to rotate ecliptic elements: the two frames
 * differ by a signed axis permutation, so applying one to the other produces
 * plausible garbage rather than an obvious error. So:
 *
 * 1. {@link resolveIauOrientation} — pure, frame-honest core in the astro
 *    frame. No scene concepts. This is what unit tests pin and what element
 *    -space consumers (e.g. a future J2 precession pass) import.
 * 2. {@link computeBodyPoleQuaternion} — thin scene adapter: `ecliptic2ThreeJs`
 *    plus an explicit `makeBasis` with a determinant guard.
 * 3. {@link computeSpinAngleRad} — the unwrapped spin angle W.
 *
 * ## Why `makeBasis` and not `setFromUnitVectors`
 *
 * The helper this replaces built the pole rotation with
 * `setFromUnitVectors(up, poleDir)`, which produces *a* rotation taking scene
 * up to the spin axis but leaves the azimuth **about** that axis arbitrary —
 * it is the minimal rotation, chosen for convenience, not measured. IAU W is
 * defined as an angle **from the node Q**, so bolting a measured W onto an
 * arbitrary azimuth is meaningless: the result is a body spinning at the right
 * rate through the wrong longitudes. The two cannot be shipped separately,
 * which is why F-01 and F-02 are one change to one function.
 *
 * Q is the ascending node of the body equator on the ICRF equator, at
 * RA = α₀ + 90°, Dec = 0. It is exactly orthogonal to the pole by
 * construction (their equatorial-cartesian dot product is identically zero),
 * so the basis is orthonormal and its determinant is +1.
 *
 * ## Provenance
 *
 * Every constant consumed here comes from a body's {@link IauOrientation}
 * record in `src/data/celestialBodies.ts`; see that file for the source and
 * the per-body disclosure of dropped periodic terms.
 */

import * as THREE from "three";
import type { CelestialBody } from "./astrophysics";
import { raDecToEclipticUnit } from "./orbital/analytical/coordUtils";
import { DAYS_PER_JULIAN_CENTURY, J2000_JD } from "./orbital/time";

const DEG2RAD = Math.PI / 180;

/**
 * One periodic term of an IAU rotation model.
 *
 * The argument is θ = `phaseDeg` + `rateDegPerCentury`·T, with T in Julian
 * centuries TDB from J2000.0. Following the IAU/WGCCRE convention, right
 * ascension and prime-meridian terms enter as A·sin θ and declination terms
 * as A·cos θ — which is why the three amplitudes are separate optional fields
 * on one shared argument rather than a single signed number.
 */
export interface IauNutPrecTerm {
  /** θ at J2000.0, degrees. */
  phaseDeg: number;
  /** dθ/dT, degrees per Julian century. */
  rateDegPerCentury: number;
  /** Amplitude added to α₀ as A·sin θ, degrees. */
  raAmpDeg?: number;
  /** Amplitude added to δ₀ as A·cos θ, degrees. */
  decAmpDeg?: number;
  /** Amplitude added to W as A·sin θ, degrees. */
  pmAmpDeg?: number;
}

/**
 * A body's IAU rotational elements: where its spin axis points and where its
 * prime meridian is at a given instant.
 *
 * **The presence of this record is the discriminator** for "this body has a
 * measured rotation solution", replacing the older `poleRA !== undefined`
 * sniffing. A record carrying only `poleRA`/`poleDec` means the pole is
 * measured but the *phase origin is not* — see {@link computeSpinAngleRad}.
 */
export interface IauOrientation {
  /** α₀ at J2000.0, degrees (ICRF). */
  poleRaDeg: number;
  /** dα₀/dT, degrees per Julian century. Absent = 0. */
  poleRaRateDegPerCentury?: number;
  /** δ₀ at J2000.0, degrees (ICRF). */
  poleDecDeg: number;
  /** dδ₀/dT, degrees per Julian century. Absent = 0. */
  poleDecRateDegPerCentury?: number;
  /** W₀, degrees: the prime meridian measured east from node Q at J2000.0. */
  primeMeridianDeg: number;
  /** Ẇ, degrees per day. Negative for retrograde rotators. */
  spinRateDegPerDay: number;
  /** Periodic corrections. Absent = the secular model only. */
  nutPrec?: readonly IauNutPrecTerm[];
}

/**
 * The evaluated orientation of a body at one instant, in the **ecliptic
 * J2000 astro frame** (x toward the vernal equinox, z toward ecliptic north).
 * Deliberately free of three.js types so element-space consumers cannot
 * accidentally mix this with a scene vector.
 */
export interface IauOrientationState {
  /** Unit vector along the spin axis (north pole). */
  poleEcl: readonly [number, number, number];
  /** Unit vector toward node Q, the prime-meridian origin. */
  nodeEcl: readonly [number, number, number];
  /** W in degrees, **unwrapped** — see {@link computeSpinAngleRad}. */
  spinDeg: number;
}

/**
 * Evaluate an IAU rotation model at a TDB instant.
 *
 * @param orientation The body's rotational elements.
 * @param jdTDB Julian date in **TDB** (from `dateToTDB`), not UT. IAU W
 *   expressions are TDB quantities; feeding a UT day count shifts Earth's
 *   spin by ΔT ≈ 0.3° in 2026, which is what the 0.1° gate in
 *   `bodyOrientation.test.ts` exists to catch.
 */
export function resolveIauOrientation(
  orientation: IauOrientation,
  jdTDB: number
): IauOrientationState {
  const d = jdTDB - J2000_JD;
  const T = d / DAYS_PER_JULIAN_CENTURY;

  let raDeg =
    orientation.poleRaDeg + (orientation.poleRaRateDegPerCentury ?? 0) * T;
  let decDeg =
    orientation.poleDecDeg + (orientation.poleDecRateDegPerCentury ?? 0) * T;

  if (orientation.nutPrec) {
    for (const term of orientation.nutPrec) {
      const theta = (term.phaseDeg + term.rateDegPerCentury * T) * DEG2RAD;
      if (term.raAmpDeg) raDeg += term.raAmpDeg * Math.sin(theta);
      if (term.decAmpDeg) decDeg += term.decAmpDeg * Math.cos(theta);
    }
  }

  const pole = raDecToEclipticUnit(raDeg, decDeg);
  // Node Q: the ascending node of the body equator on the ICRF equator.
  const node = raDecToEclipticUnit(raDeg + 90, 0);

  return {
    poleEcl: [pole.x, pole.y, pole.z],
    nodeEcl: [node.x, node.y, node.z],
    spinDeg: evaluateSpinDeg(orientation, jdTDB),
  };
}

/**
 * W in degrees, unwrapped. Shared by {@link resolveIauOrientation} and
 * {@link computeSpinAngleRad} so the render path can ask for the spin alone
 * without allocating the two pole vectors every frame.
 */
function evaluateSpinDeg(orientation: IauOrientation, jdTDB: number): number {
  const d = jdTDB - J2000_JD;
  let spinDeg =
    orientation.primeMeridianDeg + orientation.spinRateDegPerDay * d;
  if (orientation.nutPrec) {
    const T = d / DAYS_PER_JULIAN_CENTURY;
    for (const term of orientation.nutPrec) {
      if (!term.pmAmpDeg) continue;
      spinDeg +=
        term.pmAmpDeg *
        Math.sin((term.phaseDeg + term.rateDegPerCentury * T) * DEG2RAD);
    }
  }
  return spinDeg;
}

const TMP_NODE = new THREE.Vector3();
const TMP_POLE = new THREE.Vector3();
const TMP_THIRD = new THREE.Vector3();
const TMP_BASIS = new THREE.Matrix4();

/**
 * Fall back to a body's measured pole with an **unconstrained phase origin**.
 *
 * Bodies with `poleRA`/`poleDec` but no {@link IauOrientation} keep a real,
 * measured spin axis; what they lack is W₀, so their prime meridian sits at an
 * arbitrary place on that axis. Modelling them as W₀ = 0 with the spin rate
 * derived from `rotationPeriodHours` is the honest form of that gap: the axis
 * is right, the longitude is admittedly not, and no transcribed number is
 * invented to paper over it.
 */
function synthesiseFromMeasuredPole(
  body: CelestialBody
): IauOrientation | null {
  if (body.poleRA === undefined || body.poleDec === undefined) return null;
  const periodHours = body.rotationPeriodHours;
  return {
    poleRaDeg: body.poleRA,
    poleDecDeg: body.poleDec,
    primeMeridianDeg: 0,
    spinRateDegPerDay: periodHours ? (360 * 24) / periodHours : 0,
  };
}

/**
 * The best rotation solution a body has, or `null` if it has none.
 *
 * The single discriminator for "does this body have a measured spin axis" —
 * exported so callers outside the render path (obliquity readout, the panel's
 * honesty labels) ask one question instead of re-implementing the
 * `iauOrientation ?? poleRA` ladder and drifting from it.
 */
export function resolveBodyIauOrientation(
  body: CelestialBody
): IauOrientation | null {
  return body.iauOrientation ?? synthesiseFromMeasuredPole(body);
}

/**
 * The rotation taking scene axes to the body's own axes: local +Y along the
 * spin axis, local +X toward node Q.
 *
 * `rotationRef.rotation.y = computeSpinAngleRad(...)` then turns the body
 * *inside* this basis, so the two compose into "prime meridian at W east of
 * Q" — the IAU definition, rather than the old arbitrary-azimuth form.
 *
 * @param jdTDB Instant to evaluate the (time-dependent) pole at. IAU poles
 *   drift: Earth's α₀ moves 0.641°/century. Callers on the render path pass
 *   the same per-frame `jdTDB` they pass to {@link computeSpinAngleRad}.
 */
export function computeBodyPoleQuaternion(
  body: CelestialBody,
  jdTDB: number,
  target = new THREE.Quaternion()
): THREE.Quaternion {
  const orientation = resolveBodyIauOrientation(body);

  if (!orientation) {
    // Legacy display tilt: no measured pole at all, so both the axis
    // direction in longitude and the azimuth about it are conventions.
    return target.setFromEuler(
      new THREE.Euler(0, 0, -(body.axialTilt ?? 0) * DEG2RAD)
    );
  }

  const { poleEcl, nodeEcl } = resolveIauOrientation(orientation, jdTDB);
  // Astro (z-up) → scene (Y-up) is the (x, z, −y) remap of `ecliptic2ThreeJs`,
  // applied in place here rather than by call so the render path allocates
  // nothing per body per frame. A signed axis permutation preserves both unit
  // length and orthogonality, so the basis below stays orthonormal.
  TMP_POLE.set(poleEcl[0], poleEcl[2], -poleEcl[1]);
  TMP_NODE.set(nodeEcl[0], nodeEcl[2], -nodeEcl[1]);
  TMP_THIRD.crossVectors(TMP_NODE, TMP_POLE);

  TMP_BASIS.makeBasis(TMP_NODE, TMP_POLE, TMP_THIRD);

  if (import.meta.env.DEV) {
    // det = |node × pole|², so it is positive for any non-degenerate input and
    // exactly 1 for the orthonormal case. It collapses only if the record is
    // malformed — a NaN α₀, or a pole and node that are not independent — and
    // that failure renders as a body frozen at an arbitrary attitude rather
    // than as an error. Catch it where the data is wrong, not on screen.
    const det = TMP_BASIS.determinant();
    if (!(Math.abs(det - 1) < 1e-6)) {
      throw new Error(
        `bodyOrientation: degenerate pole basis for "${body.id}" (det=${det}) — check its iauOrientation/poleRA record`
      );
    }
  }

  return target.setFromRotationMatrix(TMP_BASIS);
}

/**
 * The body's spin angle W in radians, **unwrapped** (it grows without bound
 * with simulated time, and is deliberately not reduced to [0, 2π)).
 *
 * Unwrapping is load-bearing, not stylistic. Earth's cloud deck is drawn by
 * multiplying this angle by a super-rotation factor; on a *wrapped* angle that
 * multiply lands a `(factor − 1) × 360°` discontinuity at every wrap — the
 * once-per-day ~10.7° snap this wave removes. Rates multiply cleanly, wrapped
 * angles do not. Float64 holds the unwrapped value to well under a metre at
 * the equator across the app's whole date range.
 *
 * Bodies without a measured W₀ spin at their measured rate from an
 * **unconstrained** phase origin — see {@link synthesiseFromMeasuredPole}.
 */
export function computeSpinAngleRad(
  body: CelestialBody,
  jdTDB: number
): number {
  const orientation = resolveBodyIauOrientation(body);
  if (orientation) return evaluateSpinDeg(orientation, jdTDB) * DEG2RAD;

  if (!body.rotationPeriodHours) return 0;
  return ((360 * 24) / body.rotationPeriodHours) * (jdTDB - J2000_JD) * DEG2RAD;
}
