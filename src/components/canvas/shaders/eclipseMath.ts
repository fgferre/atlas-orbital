/**
 * Pure-TypeScript mirror of Gaia Sky's eclipse shading math.
 *
 * Source: `/tmp/gaiasky/assets/shader/lib/eclipses.glsl` (123 LOC,
 * MPL-2.0).
 *
 * The shader is injected verbatim (with naming adjustments) into
 * atlas's planetary `MeshStandardMaterial.onBeforeCompile` patches
 * for bodies that can be eclipsed (Earth during a solar eclipse,
 * Moon during a lunar eclipse). This module's job is to pin the
 * constants, the diffraction-spectrum gradient endpoints, the
 * `dist_segment_point` helper behaviour, and the shadow-ramp curve
 * against unit tests — so a future edit to the GLSL literal can't
 * silently drift from the Gaia source (lesson L22).
 */

/** `eclipses.glsl:13 #define UMBRA0 0.04`. Hard-black core radius in units of the eclipsing body's radius. */
export const ECLIPSE_UMBRA_CORE_RADIUS_RATIO = 0.04;

/** `eclipses.glsl:16 #define PENUMBRA0 1.7`. Outer penumbra edge: beyond this the fragment is unshadowed. */
export const ECLIPSE_PENUMBRA_RADIUS_RATIO = 1.7;

/** `eclipses.glsl:19 #define DIFFRACTION0 0.2`. Diffraction band starts this fraction of the eclipsing-body radius. */
export const ECLIPSE_DIFFRACTION_START_RATIO = 0.2;

/** `eclipses.glsl:20 #define DIFFRACTION1 1.6`. Diffraction band ends this fraction of the eclipsing-body radius. */
export const ECLIPSE_DIFFRACTION_END_RATIO = 1.6;

/** `eclipses.glsl:47 smoothstep(-0.1, 0.2, dot_NL)` terminator lower edge. */
export const ECLIPSE_EDGE_FADE_LO = -0.1;

/** `eclipses.glsl:47 smoothstep(-0.1, 0.2, dot_NL)` terminator upper edge. */
export const ECLIPSE_EDGE_FADE_HI = 0.2;

/** `eclipses.glsl:49 if (dot_NM > -0.15)` near-side gate: fragment's normal must face the eclipsing body within this slack. */
export const ECLIPSE_NEAR_SIDE_DOT_THRESHOLD = -0.15;

/** `eclipses.glsl:61 diffractionIntensity *= 0.3`. Atlas pins the peak diffraction energy scalar. */
export const ECLIPSE_DIFFRACTION_INTENSITY_SCALE = 0.3;

/** `eclipses.glsl:68 getDiffractionSpectrum(spectrumPos) * 0.5`. Spectrum pre-scale before the intensity multiply. */
export const ECLIPSE_DIFFRACTION_SPECTRUM_SCALE = 0.5;

/** `eclipses.glsl:25 mix(vec3(0.41, 0.26, 0.013), ...)`. Cool end (brown-orange) of the diffraction spectrum. */
export const ECLIPSE_DIFFRACTION_SPECTRUM_LOW: readonly [
  number,
  number,
  number,
] = [0.41, 0.26, 0.013];

/** `eclipses.glsl:26 mix(..., vec3(0.88, 0.42, 0.063), pos)`. Hot end (bright orange) of the diffraction spectrum. */
export const ECLIPSE_DIFFRACTION_SPECTRUM_HIGH: readonly [
  number,
  number,
  number,
] = [0.88, 0.42, 0.063];

export type Vec3 = readonly [number, number, number];

const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lengthSq = (a: Vec3): number => dot(a, a);
const distance = (a: Vec3, b: Vec3): number =>
  Math.sqrt(lengthSq(subtract(a, b)));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Port of `math.glsl`'s `dist_segment_point(v, w, p)`. Returns the
 * perpendicular distance from point `p` to the line segment with
 * endpoints `v` and `w`. Degenerate case (v == w) returns the
 * direct distance to the endpoint.
 */
export const distSegmentPoint = (v: Vec3, w: Vec3, p: Vec3): number => {
  const aux3 = subtract(p, v);
  const aux4 = subtract(w, v);
  const vw = subtract(v, w);
  const l2 = lengthSq(vw);
  if (l2 === 0) return distance(p, v);
  const t = dot(aux3, aux4) / l2;
  if (t < 0) return distance(p, v);
  if (t > 1) return distance(p, w);
  const projection: Vec3 = [
    v[0] + aux4[0] * t,
    v[1] + aux4[1] * t,
    v[2] + aux4[2] * t,
  ];
  return distance(p, projection);
};

/**
 * `eclipses.glsl:23-29 getDiffractionSpectrum(pos)` — mixes between
 * the cool and hot ends of the diffraction spectrum. `pos` ranges
 * `[0, 1]` across the diffraction band.
 */
export const getDiffractionSpectrum = (pos: number): Vec3 => [
  mix(
    ECLIPSE_DIFFRACTION_SPECTRUM_LOW[0],
    ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[0],
    pos
  ),
  mix(
    ECLIPSE_DIFFRACTION_SPECTRUM_LOW[1],
    ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[1],
    pos
  ),
  mix(
    ECLIPSE_DIFFRACTION_SPECTRUM_LOW[2],
    ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[2],
    pos
  ),
];

export interface EclipseShadingParams {
  /** Fragment position in world space. Atlas uses km units. */
  fragmentPosWorld: Vec3;
  /** Fragment's surface normal in world space. Should be pre-normalised. */
  normalWorld: Vec3;
  /** Unit vector from the fragment toward the light source (Sun). */
  lightDirection: Vec3;
  /** World position of the body casting the shadow. */
  eclipsingBodyPos: Vec3;
  /** World-space radius of the eclipsing body (km). */
  eclipsingBodyRadius: number;
  /**
   * `eclipses.glsl:40 lightDirection * u_vrScale`. Scale factor for
   * the ray segment so it extends past the eclipsing body. Should
   * be at least `distance(fragmentPosWorld, lightSource)` for the
   * `dist_segment_point` math to return a perpendicular distance
   * (otherwise the segment ends before the eclipsing body and the
   * function returns a too-large endpoint distance). Atlas sets
   * this per-frame in `Planet.tsx` to `distance(planet, sun) × 2`.
   */
  vrScale: number;
}

export interface EclipseShadingResult {
  /** Shadow scalar in `[0, 1]`. 0 = full umbra (black), 1 = no shadow. */
  shdw: number;
  /**
   * Diffraction tint in linear RGB. Zero outside the diffraction
   * band; orange/brown peak at mid-band. Composed by `eclipseBlend`
   * as `mix(base, diffractionTint, 1 - shdw)` — so tint replaces
   * base colour in the umbra.
   */
  diffractionTint: Vec3;
}

/**
 * 1:1 port of `eclipses.glsl:33-94 eclipseColor(...)`'s shadow + tint
 * outputs. Atlas skips the outline branch (`#ifdef eclipseOutlines`)
 * because atlas never compiles with outline support — the feature
 * is a debug wireframe mode in Gaia, not a production visual.
 */
export const computeEclipseShading = (
  params: EclipseShadingParams
): EclipseShadingResult => {
  const {
    fragmentPosWorld: f,
    normalWorld,
    lightDirection,
    eclipsingBodyPos: m,
    eclipsingBodyRadius: radius,
    vrScale,
  } = params;

  // Default: no shadow, no tint.
  let shdw = 1.0;
  let diffractionTint: Vec3 = [0, 0, 0];

  // `eclipses.glsl:40-42 vec3 l = lightDirection * u_vrScale; fl = f + l; dist = dist_segment_point(f, fl, m);`
  const fl: Vec3 = [
    f[0] + lightDirection[0] * vrScale,
    f[1] + lightDirection[1] * vrScale,
    f[2] + lightDirection[2] * vrScale,
  ];
  const dist = distSegmentPoint(f, fl, m);

  // `eclipses.glsl:43 float dot_NM = dot(normalize(normalVector), normalize(m - f));`
  const toM = subtract(m, f);
  const toMLen = Math.sqrt(lengthSq(toM));
  const toMNorm: Vec3 =
    toMLen > 0
      ? [toM[0] / toMLen, toM[1] / toMLen, toM[2] / toMLen]
      : [0, 0, 0];
  const dotNM = dot(normalWorld, toMNorm);

  // `eclipses.glsl:46-47 dot_NL + edgeFade`
  const dotNL = dot(normalWorld, lightDirection);
  const edgeFade = smoothstep(
    ECLIPSE_EDGE_FADE_LO,
    ECLIPSE_EDGE_FADE_HI,
    dotNL
  );

  // `eclipses.glsl:49 if (dot_NM > -0.15)`
  if (dotNM > ECLIPSE_NEAR_SIDE_DOT_THRESHOLD) {
    const penumbraRadius = radius * ECLIPSE_PENUMBRA_RADIUS_RATIO;
    if (dist < penumbraRadius) {
      // `eclipses.glsl:51 shdw = dist / (u_eclipsingBodyRadius * 1.7);`
      shdw = dist / penumbraRadius;

      // `eclipses.glsl:54-71 diffraction band + spectrum tint`
      const diffractionStart = radius * ECLIPSE_DIFFRACTION_START_RATIO;
      const diffractionEnd = radius * ECLIPSE_DIFFRACTION_END_RATIO;
      const diffractionRange = diffractionEnd - diffractionStart;
      if (dist > diffractionStart && dist < diffractionEnd) {
        const x = (dist - diffractionStart) / diffractionRange;
        let diffractionIntensity = 4 * x * (1 - x);
        diffractionIntensity *= ECLIPSE_DIFFRACTION_INTENSITY_SCALE;
        diffractionIntensity *= edgeFade;
        const spectrumColor = getDiffractionSpectrum(x);
        diffractionTint = [
          spectrumColor[0] *
            ECLIPSE_DIFFRACTION_SPECTRUM_SCALE *
            diffractionIntensity,
          spectrumColor[1] *
            ECLIPSE_DIFFRACTION_SPECTRUM_SCALE *
            diffractionIntensity,
          spectrumColor[2] *
            ECLIPSE_DIFFRACTION_SPECTRUM_SCALE *
            diffractionIntensity,
        ];
      }

      // `eclipses.glsl:74 shdw = mix(1.0, shdw, edgeFade);`
      shdw = mix(1.0, shdw, edgeFade);
      // `eclipses.glsl:75-77 if (dist < u_eclipsingBodyRadius * UMBRA0) shdw = 0.0;`
      if (dist < radius * ECLIPSE_UMBRA_CORE_RADIUS_RATIO) {
        shdw = 0.0;
      }
    }
  }

  return { shdw, diffractionTint };
};

/**
 * `eclipses.glsl:102-104 eclipseBlendWeightedMix` = atlas's default
 * (matches `eclipses.glsl:118-120 eclipseBlend` → WeightedMix).
 * `shadow=1` leaves base untouched; `shadow=0` returns pure tint.
 */
export const eclipseBlend = (base: Vec3, tint: Vec3, shadow: number): Vec3 => [
  mix(base[0], tint[0], 1 - shadow),
  mix(base[1], tint[1], 1 - shadow),
  mix(base[2], tint[2], 1 - shadow),
];
