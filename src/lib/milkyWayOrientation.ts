import * as THREE from "three";
import {
  equatorial2Ecliptic,
  ecliptic2ThreeJs,
} from "./orbital/analytical/coordUtils";
import { STAR_DISPLAY_BLACK_POINT } from "./starfieldShaderMath";

/**
 * Galactic ↔ scene orientation for the Milky Way panorama skybox (#4),
 * plus the display calibration measured from the shipped texture.
 *
 * ## Why this file exists separately from `gridOrientation.ts`
 *
 * `gridOrientation.ts` cites the same three Euler angles this file uses
 * (`R=32.93192°, Q=27.12825°, P=192.85948°`, per Gaia Sky's
 * `Coordinates.java:39-41`) and a `getRotationMatrix(alpha,beta,gamma) =
 * Ry(gamma)·Rz(beta)·Ry(alpha)` recipe attributed to
 * `Coordinates.java:153-157`. That recipe was re-implemented and checked
 * numerically against the two facts a galactic-frame rotation must
 * reproduce — the North Galactic Pole sits at equatorial (RA, Dec) =
 * (192.85948°, 27.12825°), and the Galactic Center sits at (266.405°,
 * −28.936°) (both standard, citable J2000 values, e.g. Liu, Zhu & Zhang
 * 2010, or the ESA Hipparcos & Tycho Catalogues 1997 Vol 1 §1.5.3) — and
 * it did not reproduce either one (off by tens of degrees, the signature
 * of a transposed or mis-ordered Euler product, not a rounding error).
 * Since the historical file is no longer part of the live tree (it was
 * replaced by the single-frame ring grid in `cfbf174`) there is nothing
 * to fix in place, and re-guessing the Java source's exact multiplication
 * order from a comment is exactly the "classic failure mode" a skybox
 * orientation cannot afford. This module instead **constructs** the
 * rotation directly from the same three cited angles via an unambiguous,
 * verifiable method (below), and pins the result against both reference
 * points in `milkyWayOrientation.test.ts`.
 *
 * ## The construction
 *
 * `P`, `Q`, `R` are three independently-meaningful angles, not an
 * opaque Euler triple:
 *
 *   - `P` = α(NGP) — right ascension of the North Galactic Pole, J2000.
 *   - `Q` = δ(NGP) — declination of the North Galactic Pole, J2000.
 *   - `R` = l(NCP) − 90° — galactic longitude of the North Celestial
 *     Pole, offset by 90° (the offset is Gaia Sky's own convention,
 *     carried over unchanged so the constant equals the cited value).
 *
 * Together they fix two unit vectors whose images under the
 * galactic→equatorial rotation `M` are known exactly:
 *
 *   M · (0,0,1)_galactic       = (cosQ·cosP, cosQ·sinP, sinQ)   [= NGP, in equatorial xyz]
 *   M · NCP_galactic           = (0,0,1)_equatorial             [NCP has galactic latitude Q, longitude R+90]
 *
 * Two vector correspondences plus right-handedness fix `M` uniquely.
 * {@link buildGalacticToEquatorialMatrix} builds it by Gram-Schmidt:
 * orthonormalise `{(0,0,1)_gal, NCP_gal}` into a frame `{f1,f2,f3}`,
 * orthonormalise `{NGP_eq, (0,0,1)_eq}` the same way into `{g1,g2,g3}`,
 * and take `M = [g1 g2 g3]·[f1 f2 f3]ᵀ`. This is checked against the
 * published numeric ICRS↔Galactic matrix (Liu, Zhu & Zhang 2010, eq. 2;
 * identical to the Hipparcos catalogue's) to machine precision in the
 * test file — the Gram-Schmidt construction and the independently
 * published matrix agree to 1e-15, which is strong evidence both are the
 * one true rotation these three cited angles define, not an artefact of
 * either derivation.
 *
 * The rest of the chain reuses code that already exists and is already
 * tested elsewhere, rather than re-deriving it: `equatorial2Ecliptic`
 * (obliquity rotation) and `ecliptic2ThreeJs` (the engine's Y-up remap)
 * both live in `orbital/analytical/coordUtils.ts` and are the same
 * functions every orbital provider in this engine uses to place a body
 * in the scene.
 *
 * ## Scene-direction → galactic-direction (what the shader actually needs)
 *
 * The fragment shader has a camera ray direction in scene (three.js
 * Y-up) space and needs the opposite chain: scene → ecliptic-astro →
 * equatorial → galactic. Every stage above is a rotation (determinant
 * +1, verified in the test file), so the inverse of the whole chain is
 * its transpose — no separate derivation, no second place for a sign
 * error to hide. {@link GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR} stores the
 * forward (galactic→scene) matrix; {@link applyRotationTranspose} runs
 * the same 9 numbers backwards. The GLSL fragment does the identical
 * thing: pasting a row-major 9-tuple into GLSL's `mat3(...)` constructor
 * (which fills **columns**) yields the **transpose** of the matrix that
 * flat array represents in row-major form — so the one constant array
 * below serves both directions in both languages, by construction, not
 * by coincidence. This is spelled out again at
 * {@link MILKY_WAY_ORIENTATION_GLSL} because it is the one place a
 * silent transpose bug would hide.
 *
 * ## The texture's own orientation convention
 *
 * NASA SVS documents (svs.gsfc.nasa.gov/4851) that the galactic-coordinate
 * layer is "centered at 0° longitude, and longitude increases to the
 * left" — i.e. moving right across the image DEcreases galactic
 * longitude. It does **not** document which pole is at the top. That
 * half of the convention was determined empirically against the actual
 * downloaded pixel data (not assumed): the Large and Small Magellanic
 * Clouds are isolated, unambiguous bright features at known galactic
 * coordinates (LMC l≈280.47°, b≈−32.75°; SMC l≈302.8°, b≈−44.3°, both
 * well south of the galactic plane). Sampling the downloaded
 * `4k_milkyway_2020_gal.exr` at both candidate pixel locations (image
 * row 0 = north galactic pole vs. image row 0 = south galactic pole)
 * found the LMC location ~14× brighter than same-latitude baseline sky
 * under the "row 0 = south pole" hypothesis, and statistically
 * indistinguishable from baseline under "row 0 = north pole" (SMC gave
 * the same result independently, ~9× vs. baseline). Conclusion: **image
 * row 0 (v=0) is the south galactic pole; row H−1 (v=1) is the north
 * galactic pole** — the opposite of the "north up" default a Plate
 * Carrée map would otherwise be assumed to use. {@link galacticLonLatToEquirectUv}
 * encodes both halves of the convention (documented longitude direction,
 * empirically-determined latitude polarity).
 */

// ---------------------------------------------------------------------------
// Cited constants
// ---------------------------------------------------------------------------

/** α(NGP), J2000, degrees — right ascension of the North Galactic Pole.
 *  Same citation as `P` in the historical `gridOrientation.ts` (Gaia
 *  Sky `Coordinates.java:39-41`, itself citing the IAU 1958 definition
 *  refined to J2000). */
export const GALACTIC_NGP_RA_DEG = 192.85948;

/** δ(NGP), J2000, degrees — declination of the North Galactic Pole.
 *  Same citation as `Q` above. */
export const GALACTIC_NGP_DEC_DEG = 27.12825;

/** l(NCP) − 90°, degrees — galactic longitude of the North Celestial
 *  Pole, offset by 90° (Gaia Sky's own convention). Same citation as
 *  `R` above; `GALACTIC_NGP_RA_DEG + 90` recovers l(NCP) = 122.93192°. */
export const GALACTIC_NCP_LON_OFFSET_DEG = 32.93192;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Matrix construction (galactic → equatorial → ecliptic → scene)
// ---------------------------------------------------------------------------

const clamp1 = (v: number): number => Math.min(Math.max(v, -1), 1);

/** Build the galactic→equatorial rotation via the two-vector Gram-Schmidt
 *  construction documented above. Pure, deterministic, no shared state —
 *  called once at module load. */
const buildGalacticToEquatorialMatrix = (): THREE.Matrix3 => {
  const q = GALACTIC_NGP_DEC_DEG * DEG2RAD;
  const p = GALACTIC_NGP_RA_DEG * DEG2RAD;
  const lNcp = (GALACTIC_NCP_LON_OFFSET_DEG + 90) * DEG2RAD;

  const ngpEq = new THREE.Vector3(
    Math.cos(q) * Math.cos(p),
    Math.cos(q) * Math.sin(p),
    Math.sin(q)
  );
  const ncpGal = new THREE.Vector3(
    Math.cos(q) * Math.cos(lNcp),
    Math.cos(q) * Math.sin(lNcp),
    Math.sin(q)
  );

  const zGal = new THREE.Vector3(0, 0, 1);
  const zEq = new THREE.Vector3(0, 0, 1);

  const f1 = zGal.clone().normalize();
  const f2 = ncpGal
    .clone()
    .sub(f1.clone().multiplyScalar(ncpGal.dot(f1)))
    .normalize();
  const f3 = f1.clone().cross(f2);

  const g1 = ngpEq.clone().normalize();
  const g2 = zEq
    .clone()
    .sub(g1.clone().multiplyScalar(zEq.dot(g1)))
    .normalize();
  const g3 = g1.clone().cross(g2);

  // M = G * Fᵀ, where F's columns are f1,f2,f3 and G's columns are
  // g1,g2,g3 — maps fᵢ to gᵢ for i=1,2,3 (both are orthonormal frames,
  // so this is exact, not a least-squares fit).
  // prettier-ignore
  const F = new THREE.Matrix3().set(
    f1.x, f2.x, f3.x,
    f1.y, f2.y, f3.y,
    f1.z, f2.z, f3.z
  );
  // prettier-ignore
  const G = new THREE.Matrix3().set(
    g1.x, g2.x, g3.x,
    g1.y, g2.y, g3.y,
    g1.z, g2.z, g3.z
  );
  return G.multiply(F.clone().transpose());
};

/** Galactic → equatorial (ICRS/J2000) rotation. Verified in
 *  `milkyWayOrientation.test.ts` against the published numeric matrix
 *  (Liu, Zhu & Zhang 2010) to 1e-14, and against the NGP/Galactic-Center
 *  reference RA/Dec. */
export const GALACTIC_TO_EQUATORIAL_MATRIX = buildGalacticToEquatorialMatrix();

/** Unit vector for a galactic (l, b) pair, in the (x→l=0,b=0; z→NGP)
 *  galactic frame. Degrees in, unit `THREE.Vector3` out. */
export const galacticLonLatToUnitVector = (
  lDeg: number,
  bDeg: number
): THREE.Vector3 => {
  const l = lDeg * DEG2RAD;
  const b = bDeg * DEG2RAD;
  const cosB = Math.cos(b);
  return new THREE.Vector3(cosB * Math.cos(l), cosB * Math.sin(l), Math.sin(b));
};

/** Galactic (l, b) → three.js scene-frame unit direction. Chains the
 *  Gram-Schmidt galactic→equatorial matrix with the engine's own
 *  `equatorial2Ecliptic` + `ecliptic2ThreeJs` (`coordUtils.ts`) so the
 *  obliquity rotation and Y-up remap are the SAME code every orbital
 *  provider uses — nothing about the ecliptic frame is redefined here. */
export const galacticToSceneDirection = (
  lDeg: number,
  bDeg: number
): THREE.Vector3 => {
  const galVec = galacticLonLatToUnitVector(lDeg, bDeg);
  const eqVec = galVec.clone().applyMatrix3(GALACTIC_TO_EQUATORIAL_MATRIX);
  const eclVec = equatorial2Ecliptic(eqVec);
  return ecliptic2ThreeJs(eclVec);
};

/** Galactic (l, b) → ecliptic J2000 ASTRONOMICAL longitude/latitude (NOT
 *  the three.js scene frame) — the quantity `milkyWayOrientation.test.ts`
 *  pins against the standard reference value for the Galactic Center.
 *  Kept separate from {@link galacticToSceneDirection} because the pin
 *  target is a citable astronomical coordinate pair, not a scene vector,
 *  and the two must not be conflated. */
export const galacticToEclipticLonLatDeg = (
  lDeg: number,
  bDeg: number
): { lonDeg: number; latDeg: number } => {
  const galVec = galacticLonLatToUnitVector(lDeg, bDeg);
  const eqVec = galVec.clone().applyMatrix3(GALACTIC_TO_EQUATORIAL_MATRIX);
  const eclVec = equatorial2Ecliptic(eqVec);
  let lonDeg = Math.atan2(eclVec.y, eclVec.x) * RAD2DEG;
  if (lonDeg < 0) lonDeg += 360;
  const latDeg = Math.asin(clamp1(eclVec.z)) * RAD2DEG;
  return { lonDeg, latDeg };
};

// ---------------------------------------------------------------------------
// Baked forward matrix + its GLSL/TS-mirrored inverse (transpose)
// ---------------------------------------------------------------------------

/**
 * Galactic → scene rotation, ROW-MAJOR flat 9-tuple:
 * `v_scene = applyRotation(GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR, v_galactic)`.
 *
 * This single array is the one source of truth for BOTH directions, in
 * both TypeScript and GLSL:
 *   - Forward (galactic→scene): {@link applyRotation} — a plain
 *     row-major matrix-vector product (dot product per output
 *     component).
 *   - Inverse (scene→galactic): {@link applyRotationTranspose} — the
 *     SAME 9 numbers, transposed. Valid because the chain that produced
 *     them (Gram-Schmidt rotation · obliquity rotation · Y-up remap) is
 *     a pure rotation (determinant +1, checked in the test file), so its
 *     inverse is its transpose — no second derivation to get wrong.
 *   - GLSL: `mat3(a0,a1,...,a8)` fills COLUMNS, so pasting this exact
 *     row-major array into a GLSL `mat3(...)` constructor produces the
 *     TRANSPOSE of what the array represents in row-major form — i.e.
 *     exactly the scene→galactic matrix, for free. `mat3 * vec3` in
 *     GLSL then computes precisely {@link applyRotationTranspose}'s
 *     result. See {@link MILKY_WAY_ORIENTATION_GLSL}.
 */
export const GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR: readonly number[] = (() => {
  const m = new THREE.Matrix3();
  // Columns of galacticToScene = images of the galactic basis vectors.
  const cx = galacticToSceneDirection(0, 0);
  const cy = galacticToSceneDirection(90, 0);
  const cz = galacticToSceneDirection(0, 90);
  // prettier-ignore
  m.set(
      cx.x, cy.x, cz.x,
      cx.y, cy.y, cz.y,
      cx.z, cy.z, cz.z
    );
  // THREE.Matrix3.elements is column-major; re-flatten to row-major.
  const e = m.elements; // [m00,m10,m20, m01,m11,m21, m02,m12,m22] column-major
  return [e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]];
})();

/** Row-major matrix-vector product: `M * v`, `m` flattened row-major. */
export const applyRotation = (
  m: readonly number[],
  v: THREE.Vector3
): THREE.Vector3 =>
  new THREE.Vector3(
    m[0] * v.x + m[1] * v.y + m[2] * v.z,
    m[3] * v.x + m[4] * v.y + m[5] * v.z,
    m[6] * v.x + m[7] * v.y + m[8] * v.z
  );

/** Transpose product: `Mᵀ * v`, `m` flattened row-major — the exact
 *  operation `mat3(m) * v` performs in GLSL (see the module doc). */
export const applyRotationTranspose = (
  m: readonly number[],
  v: THREE.Vector3
): THREE.Vector3 =>
  new THREE.Vector3(
    m[0] * v.x + m[3] * v.y + m[6] * v.z,
    m[1] * v.x + m[4] * v.y + m[7] * v.z,
    m[2] * v.x + m[5] * v.y + m[8] * v.z
  );

// ---------------------------------------------------------------------------
// Equirectangular UV mapping (empirically-validated orientation, see module doc)
// ---------------------------------------------------------------------------

/** Wrap a longitude in degrees to (−180°, 180°]. */
const wrapLonDeg = (lDeg: number): number => {
  const wrapped = ((((lDeg + 180) % 360) + 360) % 360) - 180;
  return wrapped;
};

/**
 * Galactic (l, b) → equirectangular UV of `4k_milkyway_2020_gal.jpg`.
 *
 *   u = 0.5 − wrap(l)/360   (NASA SVS: "centered at 0°, longitude
 *                            increases to the LEFT" — so increasing u,
 *                            i.e. moving right, DEcreases l)
 *   v = 0.5 + b/180         (empirically-determined: row 0 = south
 *                            galactic pole — see module doc's LMC/SMC
 *                            check)
 *
 * Pure mirror of the UV computation in {@link MILKY_WAY_ORIENTATION_GLSL}.
 */
export const galacticLonLatToEquirectUv = (
  lDeg: number,
  bDeg: number
): { u: number; v: number } => ({
  u: 0.5 - wrapLonDeg(lDeg) / 360,
  v: 0.5 + bDeg / 180,
});

/** Pure-TS mirror of the fragment shader's full per-pixel chain: a scene
 *  look direction → the UV it samples in the Milky Way panorama. Used by
 *  the orientation pin test; not called by the renderer (the GPU does
 *  this per-fragment via {@link MILKY_WAY_ORIENTATION_GLSL}). */
export const sceneDirectionToMilkyWayUv = (
  dir: THREE.Vector3
): { u: number; v: number } => {
  const galVec = applyRotationTranspose(
    GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR,
    dir
  ).normalize();
  const lDeg = Math.atan2(galVec.y, galVec.x) * RAD2DEG;
  const bDeg = Math.asin(clamp1(galVec.z)) * RAD2DEG;
  return galacticLonLatToEquirectUv(lDeg, bDeg);
};

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const glslFloat = (value: number): string => {
  const text = value.toPrecision(10);
  return /[.eE]/.test(text) ? text : `${text}.0`;
};

/**
 * GLSL pasted into `MilkyWaySkybox.tsx`'s fragment shader. Exports
 * `milkyWayUv(vec3 dir)` — world-space look direction in, equirect UV
 * out — using the identical rotation + UV formulas as
 * {@link sceneDirectionToMilkyWayUv}, generated from the same TypeScript
 * constants so the two cannot drift (same discipline as
 * `ZODIACAL_FRAGMENT_GLSL` in `zodiacalLightLut.ts`).
 *
 * `MILKY_WAY_SCENE_TO_GALACTIC` is `GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR`
 * pasted verbatim into a `mat3(...)` constructor. Per the module doc,
 * GLSL's column-fill convention makes this the SCENE→GALACTIC matrix,
 * not galactic→scene, despite the row-major source array — this is
 * intentional and required, not a bug to "fix" by transposing again.
 */
export const MILKY_WAY_ORIENTATION_GLSL = /* glsl */ `
// Row-major GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR, pasted into GLSL's
// column-filling mat3(...) constructor -- this is therefore the
// SCENE-TO-GALACTIC matrix. See milkyWayOrientation.ts module doc.
const mat3 MILKY_WAY_SCENE_TO_GALACTIC = mat3(
  ${GALACTIC_TO_SCENE_ROTATION_ROW_MAJOR.map(glslFloat).join(", ")}
);

vec2 milkyWayUv(vec3 dir) {
  vec3 gal = normalize(MILKY_WAY_SCENE_TO_GALACTIC * dir);
  float lDeg = degrees(atan(gal.y, gal.x));
  float bDeg = degrees(asin(clamp(gal.z, -1.0, 1.0)));
  // wrap l to (-180, 180]
  float lWrapped = mod(lDeg + 180.0, 360.0) - 180.0;
  float u = 0.5 - lWrapped / 360.0;
  float v = 0.5 + bDeg / 180.0;
  return vec2(u, v);
}
`;

// ---------------------------------------------------------------------------
// Display calibration (derived, not tuned — same discipline as
// zodiacalLightLut.ts's ZODIACAL_S10_TO_LINEAR)
// ---------------------------------------------------------------------------

/**
 * `u_brightnessMul` — the single disclosed display scalar multiplying
 * the decoded (already-linear, via `texture.colorSpace`) panorama
 * sample before it is added into the HDR composer buffer.
 *
 * ## Where the anchors come from
 *
 * `public/textures/4k_milkyway_2020_gal.jpg` is a re-encode of NASA
 * SVS's `milkyway_2020_4k_gal.exr` (linear-light OpenEXR half-float,
 * 4096×2048). The re-encode bakes a fixed normalisation into the 8-bit
 * asset (`display = sRGB_OETF(clamp(linear / CEILING, 0, 1))`, done
 * once at asset-build time, not at runtime), so the calibration below
 * has to account for both stages: the bake's `CEILING` divide, and the
 * runtime multiplier applied to the decoded [0,1] result.
 *
 * All four numbers were MEASURED from the actual downloaded EXR pixel
 * data by a one-time analysis pass (`.tmp_decode_exr.mjs` /
 * `analyze_exr.mjs`, not shipped — the numbers below are the durable
 * record), the same "read it off the real source, don't invent it"
 * discipline `zodiacalLightLut.ts` uses for Leinert's table:
 *
 *   - {@link MILKY_WAY_BAND_PEAK_LINEAR} = 0.121922 — the brightest
 *     row-average luminance in the image (averaged across ALL galactic
 *     longitudes at each latitude row, so a single hot pixel — Carina
 *     Nebula, the LMC core — cannot set it; it is the disk's typical
 *     brightness at its own brightest latitude, b≈−3.5°).
 *   - {@link MILKY_WAY_BAND_EDGE_LINEAR} = 0.019333 — the same
 *     row-average profile, 20° north of that peak latitude: the point
 *     at which the visible band is fading toward the general diffuse
 *     sky floor (row-average ≈0.007–0.009 by ±40–50°), i.e. roughly the
 *     outer edge of the naked-eye band's characteristic ~20°-40° width.
 *   - `CEILING` = 0.382635 — the 99.9th-percentile luminance over the
 *     WHOLE image, used as the asset-bake normalisation divisor. A
 *     robust near-maximum (excludes the top 0.1% of pixels — isolated
 *     saturated/near-saturated texels) rather than the literal maximum,
 *     which is a handful of clipped 1.0 outliers unrepresentative of
 *     any real structure. Chosen so `MILKY_WAY_BAND_PEAK_LINEAR / CEILING`
 *     leaves headroom for real local hotspots (Carina, the LMC) to sit
 *     above the disk's own row-average without immediately clipping.
 *
 * ## The derivation
 *
 * Same construction as `ZODIACAL_S10_TO_LINEAR`: map the geometric mean
 * of the feature's own measured range to the geometric mean of the
 * graded pipeline's one visible window, [{@link STAR_DISPLAY_BLACK_POINT}
 * = 0.165, bloom `luminanceThreshold` = 1.0] — first bringing both anchors into
 * "texture space" (dividing by `CEILING`, since that is what the shader
 * actually samples):
 *
 *   peakTex = 0.121922 / 0.382635 = 0.318638
 *   edgeTex = 0.019333 / 0.382635 = 0.050526
 *
 *   k = √(0.165 × 1.0) / √(0.318638 × 0.050526)
 *     = 0.406202 / √(0.016097)
 *     = 0.406202 / 0.126873
 *     = 3.20137
 *
 * At neutral exposure this puts the disk's own brightest latitude band
 * at `0.318638 × 3.20137 ≈ 1.020` — a hair over the bloom gate, a soft
 * kiss rather than the zodiacal band's 3.26× overshoot — and the ±20°
 * edge at `0.050526 × 3.20137 ≈ 0.1618` — essentially exactly the black
 * point, i.e. the band's visible width is genuinely narrow (~±20° of
 * its brightest latitude) rather than washing the whole sky. Real local
 * hotspots the row-average necessarily smooths over (Carina Nebula
 * measured directly at ≈0.447 linear, well above `CEILING`) clip to the
 * texture's 1.0 and bloom harder (≈3.2× threshold) — comparable in
 * degree to the zodiacal band's own near-Sun overshoot, and confined to
 * the same few resolved nebular knots in the source data, not spread
 * across the band.
 *
 * This keeps the explicit product requirement — "the diffuse MW is
 * genuinely fainter than the zodiacal band at 1 AU… do not make it
 * dominate" — true by construction: the zodiacal peak sits at 19.7×
 * the black point (3.26× bloom); the Milky Way's disk-average peak
 * sits at essentially 1.0× bloom (6.2× dimmer), with only isolated
 * nebular knots reaching zodiacal-peak territory, and its own diffuse
 * (unlike zodiacal's distance-modulated) brightness does not change
 * with camera position — it is a fixed backdrop, not a live cue.
 *
 * Disclosed in `CreditsModal.tsx`. Runtime eye verification of this
 * value is owed to the owner — see the wave file — the same status the
 * zodiacal calibration carries.
 */
export const MILKY_WAY_BAND_PEAK_LINEAR = 0.121922;
export const MILKY_WAY_BAND_EDGE_LINEAR = 0.019333;
export const MILKY_WAY_TEXTURE_CEILING = 0.382635;
export const MILKY_WAY_BLOOM_THRESHOLD = 1.0;

export const MILKY_WAY_BRIGHTNESS_MULTIPLIER = (() => {
  const peakTex = MILKY_WAY_BAND_PEAK_LINEAR / MILKY_WAY_TEXTURE_CEILING;
  const edgeTex = MILKY_WAY_BAND_EDGE_LINEAR / MILKY_WAY_TEXTURE_CEILING;
  return (
    Math.sqrt(STAR_DISPLAY_BLACK_POINT * MILKY_WAY_BLOOM_THRESHOLD) /
    Math.sqrt(peakTex * edgeTex)
  );
})();
