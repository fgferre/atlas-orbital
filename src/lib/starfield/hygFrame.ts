/**
 * HYG catalog frame conversion — equatorial J2000 → atlas scene frame.
 *
 * **Why this module exists.** The HYG binary stores cartesian
 * coordinates in the *equatorial* J2000 frame (x toward the vernal
 * equinox, z toward the celestial north pole). Every other position in
 * the scene lives in the three.js Y-up remap of the *ecliptic* J2000
 * frame — see `lib/orbital/analytical/coordUtils.ts:ecliptic2ThreeJs`
 * (`(x, z, −y)`) and `AstroPhysics.equatorialToEcliptic`.
 *
 * Before this module, three call sites (`Starfield` mesh rotation,
 * `hygFocusResolver`, `StarHoverPicker`) each applied a bare
 * `R_x(obliquity)` to the raw equatorial vector and skipped the
 * ecliptic→three.js remap. That is *not* the same transform: the
 * celestial north pole landed at `(0, −sinε, +cosε)` instead of
 * `(0, +cosε, −sinε)`, i.e. the whole starfield sat 136.8° away from
 * the frame the planets, grid and lighting use. Because all three sites
 * shared the same wrong math, render / picking / focus stayed mutually
 * consistent and the error was invisible from inside the starfield —
 * which is exactly why the conversion now lives in ONE place.
 *
 * The composed transform is the standard equatorial→ecliptic rotation
 *
 *   x_ecl = x
 *   y_ecl = y·cosε + z·sinε
 *   z_ecl = −y·sinε + z·cosε
 *
 * followed by `ecliptic2ThreeJs` (`x, z, −y`), which collapses to
 *
 *   X = x
 *   Y = −y·sinε + z·cosε
 *   Z = −(y·cosε + z·sinε)
 *
 * Sanity anchors (both verified in `hygFocusResolver.test.ts`):
 *   • celestial north pole `(0, 0, 1)` → `(0, +cosε, −sinε)`
 *   • ecliptic north pole `(0, −sinε, cosε)` → `(0, 1, 0)`
 *
 * The map is a rigid rotation (orthonormal, det = +1), so magnitudes —
 * and therefore every parsec-distance helper that reads raw catalog
 * positions — are unaffected.
 */

import * as THREE from "three";

/**
 * Mean obliquity of the ecliptic at J2000.0, in radians (IAU 2006:
 * 23° 26′ 21.406″ = 23.4392808°). Single source of truth for the HYG
 * frame conversion; replaces the `23.4` literals that were forked
 * across `Starfield.tsx`, `StarHoverPicker.tsx` and
 * `hygFocusResolver.ts`. Matches the value quoted for the equatorial
 * grid in `lib/gridOrientation.ts` and used by
 * `AstroPhysics.equatorialToEcliptic`, so the starfield now lines up
 * with the rest of the engine to arcsecond level rather than to 0.04°.
 */
export const HYG_OBLIQUITY_RAD = (23.4392808 * Math.PI) / 180;

const COS_OBLIQUITY = Math.cos(HYG_OBLIQUITY_RAD);
const SIN_OBLIQUITY = Math.sin(HYG_OBLIQUITY_RAD);

/**
 * Convert one HYG equatorial-J2000 vector into the scene frame.
 *
 * Works for positions *and* for any other vector carried in the
 * catalog's frame (proper-motion velocities, pole directions): the map
 * is linear, so it applies unchanged to derivatives.
 *
 * Writes into `out` (default: a fresh `Vector3`) and returns it —
 * mirroring atlas's existing math-lib idiom (`cameraRelative.ts:90`)
 * so hot callers can pass a scratch vector and allocate nothing.
 */
export const hygEquatorialToScene = (
  x: number,
  y: number,
  z: number,
  out: THREE.Vector3 = new THREE.Vector3()
): THREE.Vector3 =>
  out.set(
    x,
    -y * SIN_OBLIQUITY + z * COS_OBLIQUITY,
    -(y * COS_OBLIQUITY + z * SIN_OBLIQUITY)
  );

/**
 * Bulk, allocation-free variant: rewrite a packed `[x0,y0,z0, x1,…]`
 * Float32Array of equatorial-J2000 triplets into the scene frame,
 * optionally scaling by `scale` in the same pass (parsec → world unit).
 *
 * Used by `Starfield` on the ~109 k-star position and velocity buffers.
 * Doing it once at buffer-build time (instead of via a mesh rotation or
 * per-frame work) keeps the cost at a single O(N) pass per catalog
 * load, with zero per-star object allocation.
 *
 * Trailing elements that do not complete a triplet are left untouched.
 */
export const transformHygEquatorialTripletsInPlace = (
  triplets: Float32Array,
  scale = 1
): void => {
  const cos = COS_OBLIQUITY * scale;
  const sin = SIN_OBLIQUITY * scale;
  const n = triplets.length - (triplets.length % 3);
  for (let i = 0; i < n; i += 3) {
    const y = triplets[i + 1];
    const z = triplets[i + 2];
    triplets[i] *= scale;
    triplets[i + 1] = -y * sin + z * cos;
    triplets[i + 2] = -(y * cos + z * sin);
  }
};
