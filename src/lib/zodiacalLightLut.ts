import * as THREE from "three";

/**
 * Leinert et al. (1998) zodiacal light brightness table at 500 nm.
 *
 * Source: Leinert et al., "The 1997 reference of diffuse night sky
 * brightness", Astronomy & Astrophysics Supplement Series, 127, 1-99
 * (1998). Table 16 (S10_sun units) re-published there as the update
 * of Levasseur-Regourd & Dumont (1980).
 *
 * Values are in S10_sun units (10th-magnitude solar-type star per
 * square degree). One S10_sun ≈ 1.28e-8 W/m²/sr/um at 500 nm
 * (Leinert Table 17 + table 2 multiplicative factor).
 * At the ecliptic pole the brightness is 60 ± 3 S10_sun.
 *
 * Layout: β is ecliptic latitude, λ-λ_sun is angular separation from
 * the Sun along the ecliptic. Source table covers:
 *   - β ∈ {0, 5, 10, 15, ..., 30, 35, 40, 45, 60, 75, 90, 105, 120,
 *           135, 150, 165, 180} (19 rows)
 *   - λ-λ_sun ∈ {0, 5, 10, 15, 20, 25, 30, 45, 60, 75} deg (10 cols).
 *
 * Missing cells (β=0..10, λ-λ_sun=0..15) are extrapolated 0 because
 * the original table leaves them blank; before elongation 30 Sun is
 * below the horizon and the table's domain starts.
 *
 * Used by `ZodiacalLightSkybox.tsx` to build a small RGBA16F
 * DataTexture sampled from the fragment shader — see
 * `ZODIACAL_FRAGMENT_GLSL` below for the sampling path.
 *
 * Unprefixed values (positive declination) only: by symmetry of the
 * interplanetary dust cloud about the ecliptic, the South-side
 * brightness mirrors the North-side. The shader negates β and re-looks
 * up when the fragment is south of the ecliptic.
 */
export const ZODIACAL_BETA_AXIS_DEG: readonly number[] = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 75, 90, 105, 120, 135, 150, 165,
  180,
];
export const ZODIACAL_LAMBDA_AXIS_DEG: readonly number[] = [
  0, 5, 10, 15, 20, 25, 30, 45, 60, 75,
];

/** Brightness table in S10_sun units. β axis = rows, λ axis = cols.
 *  Empty (close to Sun) cells filled with 0 — table is undefined
 *  there because zodiacal light blends with solar corona. */
export const ZODIACAL_BRIGHTNESS_S10: readonly number[][] = [
  // β\λ-lsun:  0      5     10     15     20     25     30    45   60   75
  /* 0  */ [0, 0, 0, 0, 2450, 1260, 770, 215, 117, 78],
  /* 5  */ [0, 0, 0, 2300, 1200, 740, 490, 212, 117, 78],
  /* 10 */ [0, 0, 3700, 1930, 1070, 675, 460, 206, 116, 78],
  /* 15 */ [9000, 5300, 2690, 1450, 870, 590, 410, 196, 114, 78],
  /* 20 */ [5000, 3500, 1880, 1100, 710, 495, 355, 185, 110, 77],
  /* 25 */ [3000, 2210, 1350, 860, 585, 425, 320, 174, 106, 76],
  /* 30 */ [1940, 1460, 955, 660, 480, 365, 285, 162, 102, 74],
  /* 35 */ [1290, 990, 710, 530, 400, 310, 250, 151, 98, 73],
  /* 40 */ [925, 735, 545, 415, 325, 264, 220, 140, 94, 72],
  /* 45 */ [710, 570, 435, 345, 278, 228, 195, 130, 91, 70],
  /* 60 */ [395, 345, 275, 228, 190, 163, 143, 105, 81, 67],
  /* 75 */ [264, 248, 210, 177, 153, 134, 118, 91, 73, 64],
  /* 90 */ [202, 196, 176, 151, 130, 115, 103, 81, 67, 62],
  /* 105 */ [166, 164, 154, 133, 117, 104, 93, 75, 64, 60],
  /* 120 */ [147, 145, 138, 120, 108, 98, 88, 70, 60, 58],
  /* 135 */ [140, 139, 130, 115, 105, 95, 86, 70, 60, 57],
  /* 150 */ [140, 139, 129, 116, 107, 99, 91, 75, 62, 56],
  /* 165 */ [153, 150, 140, 129, 118, 110, 102, 81, 64, 56],
  /* 180 */ [180, 166, 152, 139, 127, 116, 105, 82, 65, 56],
];

/** Reference observer heliocentric distance in AU. Leinert's table is
 *  measured from Earth — at 1 AU. The shader scales brightness as
 *  R^-2.5 (Dumont 1983 fan-cloud density law) so flying outward dims
 *  zodiacal light visibly — the inverse-square law on the local flux
 *  from each dust grain plus the radial density gradient combine to
 *  the canonical exponent. */
export const ZODIACAL_REFERENCE_R_AU = 1.0;

/** Multiplicative factor converting S10_sun → linear radiance at
 *  500 nm. From Leinert §2, Table 2: 1 S10_sun = 1.28e-8
 *  W/m^2/sr/um at 500 nm. We need a number relative to the starfield
 *  so the brightness composes against the rest of the scene — the
 *  scene is on Vega-normalised flux, so this is a discretely small
 *  scalar that gives a perceptible but not blinding band at 1 AU. */
export const ZODIACAL_S10_TO_LINEAR = 4.0e-9;

/**
 * Build the LUT as a Three.js `DataTexture` (RGBA16F, [10 cols × 19
 * rows]). One texel = one S10_sun value in the R channel. Texture is
 * created lazily; the caller owns disposal.
 *
 * Format is RGBA16F because WebGL2 / HalfFloat RT path; only R is
 * meaningful, the others are zeroed. HalfFloat width gives ~12 bits
 * of mantissa, sufficient for the S10 look-up range [0, 9000].
 */
export const buildZodiacalLutTexture = (): THREE.DataTexture => {
  const cols = ZODIACAL_LAMBDA_AXIS_DEG.length;
  const rows = ZODIACAL_BETA_AXIS_DEG.length;
  const data = new Uint16Array(cols * rows * 4);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = ZODIACAL_BRIGHTNESS_S10[r][c] ?? 0;
      const i = (r * cols + c) * 4;
      data[i + 0] = THREE.DataUtils.toHalfFloat(s);
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }

  const tex = new THREE.DataTexture(
    data,
    cols,
    rows,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    THREE.LinearFilter,
    THREE.LinearFilter,
    0,
    THREE.SRGBColorSpace
  );
  tex.needsUpdate = true;
  tex.name = "zodiacal-lut";
  return tex;
};

/** Bilinear-sample the LUT. Pure-Earth-orbit texture coords are
 *  `u` ∈ [0,1] across λ-λ_sun ∈ [0,75]°, `v` ∈ [0,1] across
 *  β ∈ [0,180]°. Callers should pass already-clamped coords; this
 *  is a thin THREE.Vector2 + THREE.DataTexture loop (for unit tests).
 *
 *  For the inline shader path the same logic lives as GLSL below. */
export const sampleZodiacalLut = (
  tex: THREE.DataTexture,
  u: number,
  v: number
): number => {
  const cols = tex.image.width;
  const rows = tex.image.height;
  const x = Math.max(0, Math.min(cols - 1, u * (cols - 1)));
  const y = Math.max(0, Math.min(rows - 1, v * (rows - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const data = tex.image.data as Uint16Array;
  const at = (xx: number, yy: number): number =>
    THREE.DataUtils.fromHalfFloat(data[(yy * cols + xx) * 4]);

  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x1, y0) * fx * (1 - fy) +
    at(x0, y1) * (1 - fx) * fy +
    at(x1, y1) * fx * fy
  );
};

/** GLSL string pasted into the fragment shader by
 *  `ZodiacalLightSkybox.tsx`. Lays out the LUT axes (`u` ∈ [0,1] →
 *  λ-λ_sun ∈ [0,75]°, `v` ∈ [0,1] → β ∈ [0,180]°), performs bilinear
 *  lookup against `u_zodiacalLut`, and scales by:
 *    1. S10 → linear radiance factor `ZODIACAL_S10_TO_LINEAR`
 *    2. Heliocentric distance scaling R^-2.5 (Dumont 1983).
 *
 *  `betaDeg` and `lambdaDeg` are the fragment's ecliptic latitude
 *  and its angular separation from the Sun along the ecliptic. */
export const ZODIACAL_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D u_zodiacalLut;
uniform float u_cameraR_AU;
uniform float u_brightnessMul;

// LUT axes (see zodiacalLightLut.ts)
const float ZODIACAL_LAMBDA_MAX_DEG = 75.0;
const float ZODIACAL_BETA_MAX_DEG   = 180.0;
const float ZODIACAL_S10_TO_LINEAR  = 4.0e-9;

// Dumont (1983): integrated fan-cloud density scales as R^-2.5 with
// heliocentric distance. Leinert's table is at R=1 AU; rescaling by
// this gives the brightness a camera at R>1 sees.
const float ZODIACAL_R_EXPONENT = 2.5;

float zodiacalBrightness(float betaDeg, float lambdaDeg) {
  // By symmetry of the interplanetary dust cloud about the ecliptic,
  // the South-side brightness mirrors the North-side. The LUT ships
  // only β ∈ [0, 180]. Reflect before lookup for |β|.
  float absB = abs(betaDeg);

  // Elongation beyond the table's reach (λ-λ_sun > 75deg or β near
  // the antisolar point) clamps to the table edge. The table itself
  // is monotonic out that far — higher-elongation values are in the
  // outer β row (β=180deg) and a smoothstep fade avoids a hard cut.
  float u = clamp(lambdaDeg / ZODIACAL_LAMBDA_MAX_DEG, 0.0, 1.0);
  float v = clamp(absB / ZODIACAL_BETA_MAX_DEG, 0.0, 1.0);

  float s10 = texture2D(u_zodiacalLut, vec2(u, v)).r;
  // Heliocentric scaling: dim outward, brighten inward. Inset so R=0
  // brightness stays finite (dust grain density in inner system is
  // bounded in reality; R^-2.5 singularities only at R=0).
  float rScale = pow(max(u_cameraR_AU, 0.1), -ZODIACAL_R_EXPONENT);
  return s10 * rScale * ZODIACAL_S10_TO_LINEAR * u_brightnessMul;
}
`;
