/**
 * Port of Gaia Sky's grid orientation system (MPL-2.0) —
 * rotation matrices + per-orientation color callouts that
 * `GridRecursiveRadio.java:34-48` switches between when the
 * user toggles Equatorial / Ecliptic / Galactic.
 *
 * Source citations under `/tmp/gaiasky/core/src/gaiasky/`:
 *  - `util/coord/Coordinates.java:26-27` — `OBLIQUITY_DEG_J2000`
 *  - `util/coord/Coordinates.java:39-41` — ICRS→galactic angles
 *    `R=32.93192`, `Q=27.12825`, `P=192.85948` (astropy-derived
 *    per the header comment on line 34-38).
 *  - `util/coord/Coordinates.java:65-74` — the three rotation
 *    matrices composed via `getRotationMatrix(alpha, beta, gamma)`.
 *  - `util/coord/Coordinates.java:153-157` — `getRotationMatrix`
 *    is `Ry(gamma) * Rz(beta) * Ry(alpha)` in libGDX's
 *    post-multiply convention (same as Three.js's matrix
 *    composition when applied in the order `a.multiply(b)`).
 *  - `util/color/ColorUtils.java:28-32` — `gRed` / `gGreen` /
 *    `gBlue` literal RGBA floats.
 *  - `scene/component/GridRecursive.java:21-23` — the mapping
 *    `ccEq=gRed` / `ccEcl=gGreen` / `ccGal=gBlue`.
 *
 * **Frame convention.** Gaia uses libGDX's Y-up world with the
 * grid mesh pre-rotated onto the XZ plane via
 * `GridRecUpdater.java:144` `localTransform.rotate(1, 0, 0, 90)`.
 * Atlas follows the same convention — `GridRecursive.tsx` rotates
 * a Three.js `PlaneGeometry` (naturally in XY) by `-π/2` around X
 * to lay it on atlas's XZ ecliptic plane. The orientation matrix
 * from this module is applied as a FURTHER rotation **on top** of
 * that base tilt, via a `<group>` wrapper around the mesh.
 */

import * as THREE from "three";

export type GridOrientation = "equatorial" | "ecliptic" | "galactic";

export const OBLIQUITY_DEG_J2000 = 23.4392808;

// ICRS → galactic Euler angles (Coordinates.java:39-41).
export const GALACTIC_R_DEG = 32.93192;
export const GALACTIC_Q_DEG = 27.12825;
export const GALACTIC_P_DEG = 192.85948;

// Per-orientation color callouts (ColorUtils.java:28-32 + GridRecursive.java:21-23).
// Literal 8-bit RGB components from Gaia source:
//   gRed   = [219, 68, 55,  255]  → ccEq  (Equatorial)
//   gGreen = [15,  157, 88, 255]  → ccEcl (Ecliptic)
//   gBlue  = [66,  133, 244, 255] → ccGal (Galactic)
export const GRID_ORIENTATION_COLOR_BYTES: Record<
  GridOrientation,
  readonly [number, number, number, number]
> = {
  equatorial: [219, 68, 55, 255],
  ecliptic: [15, 157, 88, 255],
  galactic: [66, 133, 244, 255],
};

/**
 * The linear-RGBA vec4 the shader consumes as `u_diffuseColor`.
 * Keeps the Gaia 8-bit literals exact and does the divide-by-255
 * once. Alpha stays at 1.0 — per-orientation alpha curves belong
 * to the opacity driver, not the color swatch.
 */
export const GRID_ORIENTATION_COLORS: Record<
  GridOrientation,
  readonly [number, number, number, number]
> = {
  equatorial: [219 / 255, 68 / 255, 55 / 255, 1],
  ecliptic: [15 / 255, 157 / 255, 88 / 255, 1],
  galactic: [66 / 255, 133 / 255, 244 / 255, 1],
};

/**
 * Port of `Coordinates.getRotationMatrix(alpha, beta, gamma)` at
 * `Coordinates.java:153-157`. Returns a Three.js `Matrix4` that
 * applies `Ry(gamma) * Rz(beta) * Ry(alpha)` when treated as a
 * vector transform (v' = M * v). Inputs are degrees; the internal
 * conversion to radians matches libGDX's convention.
 *
 * libGDX's `Matrix4D.rotate(ax, ay, az, angleDeg)` right-multiplies
 * the matrix by a fresh axis-angle rotation. Applied in the order
 *   `new Matrix4D().rotate(Y, gamma).rotate(Z, beta).rotate(Y, alpha)`
 * the accumulated matrix is `Ry(gamma) * Rz(beta) * Ry(alpha)`.
 * Three.js's `Matrix4.multiply(b)` is also right-multiply, so we
 * build the same product with the same order.
 */
export const getGridRotationMatrix = (
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number
): THREE.Matrix4 => {
  const m = new THREE.Matrix4();
  const ry1 = new THREE.Matrix4().makeRotationY(
    THREE.MathUtils.degToRad(gammaDeg)
  );
  const rz = new THREE.Matrix4().makeRotationZ(
    THREE.MathUtils.degToRad(betaDeg)
  );
  const ry2 = new THREE.Matrix4().makeRotationY(
    THREE.MathUtils.degToRad(alphaDeg)
  );
  return m.identity().multiply(ry1).multiply(rz).multiply(ry2);
};

/**
 * Gaia's `eclipticToEquatorial = getRotationMatrix(0, OBLIQUITY, 0)`
 * (Coordinates.java:69) — a pure Z-axis rotation by the obliquity
 * of the ecliptic.
 */
export const getEclipticToEquatorialMatrix = (): THREE.Matrix4 =>
  getGridRotationMatrix(0, OBLIQUITY_DEG_J2000, 0);

/**
 * Gaia's `galacticToEquatorial = getRotationMatrix(-R, 90 - Q, 90 + P)`
 * (Coordinates.java:73). The `-R` / `90 - Q` / `90 + P` offsets
 * come from the Euler-angle decomposition `R_3(-R) R_1(π/2 - Q)
 * R_3(π/2 + P)` described in `Coordinates.java:34-38`.
 */
export const getGalacticToEquatorialMatrix = (): THREE.Matrix4 =>
  getGridRotationMatrix(
    -GALACTIC_R_DEG,
    90 - GALACTIC_Q_DEG,
    90 + GALACTIC_P_DEG
  );

/**
 * Select the rotation matrix applied to the grid mesh **on top of**
 * the base XZ-plane tilt (`rotation-x = -π/2`). Ecliptic is the
 * identity because atlas's world frame is already ecliptic-aligned
 * (planets orbit on the XZ plane); Equatorial re-tilts by the
 * obliquity; Galactic applies the full ICRS→galactic rotation.
 *
 * Returns a FRESH Matrix4 each call — callers own its lifetime
 * (no shared mutable state to bite the React render model).
 */
export const getGridOrientationMatrix = (
  orientation: GridOrientation
): THREE.Matrix4 => {
  switch (orientation) {
    case "ecliptic":
      return new THREE.Matrix4().identity();
    case "equatorial":
      return getEclipticToEquatorialMatrix();
    case "galactic":
      return getGalacticToEquatorialMatrix();
  }
};

export const GRID_ORIENTATIONS: readonly GridOrientation[] = [
  "ecliptic",
  "equatorial",
  "galactic",
] as const;

export const GRID_ORIENTATION_LABELS: Record<GridOrientation, string> = {
  ecliptic: "Ecliptic",
  equatorial: "Equatorial",
  galactic: "Galactic",
};
