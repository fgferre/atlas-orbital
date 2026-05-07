/**
 * Pure-TypeScript mirrors of the Gaia Sky star vertex + fragment math
 * that ships in `src/components/canvas/Starfield.tsx`. The shader is
 * authoritative; this file exists so the math has an executable shape
 * unit tests can pin. Keep both sides in sync.
 *
 * θ.1 shipped the fragment-kernel port from `star.group.quad.fragment.glsl`;
 * θ.1b (this file's rewrite) ports the vertex solid-angle math from
 * `star.group.quad.vertex.glsl` and retires the NASA-Eyes
 * `brightness = 2·log(1 + flux·250)` transfer curve + `[5, 50]` /
 * `[0.05, 1.0]` hard floors. See `tasks/phase-gaia-sky.md §2, §5 θ.1/θ.1b`.
 *
 * Two concerns live here:
 *
 *   1. **Vertex solid-angle mapping** (`starfieldSolidAngleMetrics`) —
 *      mirrors the source's
 *        solidAngle = a_size / dist;
 *        opacity    = lint(solidAngle, u_solidAngleMap, u_opacityLimits);
 *        solidAngle = clamp(
 *          radians12(pow(degrees12(solidAngle), u_brightnessPower)),
 *          u_minQuadSolidAngle, 3e-8);
 *        quadSize   = solidAngle * dist * sizeFactor;
 *      with Gaia Sky's smoothstep-based `lint` and its `degrees12/radians12`
 *      precision wrappers around `pow()` (both confirmed in Round 5 of the
 *      2026-04-20 θ-audit — `lib/math.glsl` and `lib/angles.glsl`).
 *   2. **Fragment core-kernel** (`starfieldCoreKernel`) — unchanged from
 *      θ.1: mirrors
 *        core = saturate(1.0 - smoothstep(0.0, 0.04, dist_from_center * 2.0))
 *      from `star.group.quad.fragment.glsl`.
 */

// -----------------------------------------------------------------------------
// Fragment core-kernel (θ.1 — unchanged)
// -----------------------------------------------------------------------------

// Gaia Sky `star.group.quad.fragment.glsl` core-kernel smoothstep edges.
// Source: `core = saturate(1.0 - smoothstep(0.0, 0.04, distance(vec2(0.5), uv) * 2.0))`.
// NOT the (0.45, 0.50) pixel-space values rolled back on 2026-04-20.
export const CORE_SMOOTHSTEP_EDGE_LOW = 0.0;
export const CORE_SMOOTHSTEP_EDGE_HIGH = 0.04;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Pure-TS mirror of the Gaia Sky fragment core kernel. `r` is the
 * UV-space distance from sprite center scaled × 2 so `r = 0` is the
 * exact center and `r = 1` is the sprite edge (matches the shader's
 * `distance(vec2(0.5), uv) * 2.0`). Returns the core contribution the
 * shader multiplies by `2.0` and adds to `vColor` before premultiplied
 * additive blending.
 */
export const starfieldCoreKernel = (r: number): number => {
  return clamp(
    1 - smoothstep(CORE_SMOOTHSTEP_EDGE_LOW, CORE_SMOOTHSTEP_EDGE_HIGH, r),
    0,
    1
  );
};

export type Rgb = readonly [number, number, number];

/**
 * Gaia Sky `ColorUtils.BVtoRGB` port. The source path converts B-V to
 * effective temperature with Ballesteros, then to xyY, then XYZ, then
 * gamma-corrected sRGB, and finally normalizes by max(1, maxChannel).
 */
export const gaiaBvToRgb = (bv: number): Rgb => {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

  let x = 0;
  let y = 0;

  if (t >= 1667 && t <= 4000) {
    x =
      -0.2661239e9 / (t * t * t) +
      -0.234358e6 / (t * t) +
      0.8776956e3 / t +
      0.17991;
  } else if (t > 4000 && t <= 25000) {
    x =
      -3.0258469e9 / (t * t * t) +
      2.1070379e6 / (t * t) +
      0.2226347e3 / t +
      0.24039;
  }

  if (t >= 1667 && t <= 2222) {
    y =
      -1.1063814 * x * x * x - 1.3481102 * x * x + 2.18555832 * x - 0.20219683;
  } else if (t > 2222 && t <= 4000) {
    y =
      -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
  } else if (t > 4000 && t <= 25000) {
    y = 3.081758 * x * x * x - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  }

  const Y = y === 0 ? 0 : 1;
  const X = y === 0 ? 0 : (x * Y) / y;
  const Z = y === 0 ? 0 : ((1 - x - y) * Y) / y;

  const r = correctGamma(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const g = correctGamma(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const b = correctGamma(0.0557 * X - 0.204 * Y + 1.057 * Z);
  const maxChannel = Math.max(1, r, g, b);

  return [
    Math.max(r / maxChannel, 0),
    Math.max(g / maxChannel, 0),
    Math.max(b / maxChannel, 0),
  ];
};

const correctGamma = (linear: number): number => {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  const a = 0.5;
  return (1 + a) * Math.pow(linear, 1 / 2.4) - a;
};

export const GAIA_STAR_COLOR_SATURATION = 0.16;

/**
 * Gaia Sky `ParticleUtils.saturateColor` equivalent for non-highlighted
 * stars: RGB -> HSV, add `scene.star.saturate` to S, clamp, back to RGB.
 */
export const saturateStarRgb = (
  rgb: Rgb,
  amount = GAIA_STAR_COLOR_SATURATION
): Rgb => {
  const [h, s, v] = rgbToHsv(rgb);
  return hsvToRgb(h, clamp(s + amount, 0, 1), v);
};

const rgbToHsv = ([r, g, b]: Rgb): Rgb => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h /= 6;
    if (h < 0) h += 1;
  }

  return [h, max === 0 ? 0 : delta / max, max];
};

const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  if (s === 0) return [v, v, v];
  const sector = h * 6;
  const i = Math.floor(sector);
  const f = sector - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
};

/**
 * Gaia Sky `star.group.quad.fragment.glsl` final composite:
 * `saturate(alpha * vec4(v_col.rgb + core * 2.0, 1.0))`.
 */
export const starfieldFragmentRgba = (
  color: Rgb,
  alpha: number,
  core: number,
  profile: number
): readonly [number, number, number, number] => {
  const a = alpha * profile;
  return [
    clamp(a * (color[0] + core * 2), 0, 1),
    clamp(a * (color[1] + core * 2), 0, 1),
    clamp(a * (color[2] + core * 2), 0, 1),
    clamp(a, 0, 1),
  ];
};

// -----------------------------------------------------------------------------
// Vertex solid-angle mapping (θ.1b — 2026-04-20)
// -----------------------------------------------------------------------------

// Host defaults verified against `StarSetQuadComponent.java:46` +
// `Constants.java:91,100,110-112`. Atlas-side initial values align with
// Gaia Sky's defaults; `Settings.java StarSettings.opacity[]` is
// user-adjustable in Gaia Sky at runtime, we pick a fixed pair for
// shipping.
export const U_SOLID_ANGLE_MAP: readonly [number, number] = [1.0e-10, 2.0e-9];
// Gaia Sky `config.yaml` default — verified 2026-04-20 validation round.
// `scene.star.opacity: [0.0, 1.0]`. The earlier draft used `[0.1, 0.95]`
// which injected a 0.1 opacity floor on the faintest stars, producing
// a uniform background haze that masked the bright-star hierarchy. The
// source's [0.0, 1.0] lets faint stars fade to invisible and bright
// stars saturate to full — matching the star-to-star contrast a user
// expects at a solar-system interior view.
export const U_OPACITY_LIMITS: readonly [number, number] = [0.0, 1.0];
export const U_BRIGHTNESS_POWER_DEFAULT = 1.0;
export const U_BRIGHTNESS_POWER_RANGE: readonly [number, number] = [0.9, 1.1];
// Gaia Sky default `u_alphaSizeBr.z`:
// config.yaml scene.star.brightness=2.22, remapped in StarSetQuadComponent
// from [0.4, 8.0] to [0, 4].
export const U_STAR_BRIGHTNESS_DEFAULT = ((2.22 - 0.4) / (8.0 - 0.4)) * 4.0;
// Gaia Sky `u_minQuadSolidAngle` is RESOLUTION-ADAPTIVE, NOT fixed.
// Host math: `minQuadSolidAngle = 1.8e-9 × 1440 / backBufferHeight`
// (`StarSetQuadComponent.java:68`). Keeps the minimum quad at ≈2–3 px
// across resolutions so faint stars floor at visible size instead of
// fading to sub-pixel. The constant below is the 1440p-baseline value
// that `computeMinQuadSolidAngle` scales at runtime.
export const U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE = 1.8e-9;
// Kept as export for legacy consumers — this is the floor used when
// no runtime resolution is known (e.g. unit tests); the Starfield.tsx
// useFrame writes the resolution-scaled value into the uniform.
export const U_MIN_QUAD_SOLID_ANGLE = U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE;

/**
 * Resolution-adaptive minimum quad solid angle — mirrors Gaia Sky's
 * `updateMinQuadSolidAngle` formula from `StarSetQuadComponent.java:68`.
 * `backBufferHeight` is the render-buffer height in physical pixels.
 * At 1440p this returns the source baseline `1.8e-9`; at 1080p it
 * scales up to ~`2.4e-9` (larger floor → brighter faint stars so
 * single-pixel visibility is preserved on smaller backbuffers).
 */
export const computeMinQuadSolidAngle = (backBufferHeight: number): number => {
  const h = Math.max(backBufferHeight, 1);
  return (U_MIN_QUAD_SOLID_ANGLE_1440P_BASELINE * 1440) / h;
};
// Upper clamp is a SOURCE-LITERAL 3.0e-8 in Gaia Sky's
// star.group.quad.vertex.glsl:105. Not a runtime uniform — inlined in
// both the shader and the TS mirror below so the atlas cannot
// accidentally drift the ceiling away from the source
// (Codex θ.1b review finding #2, 2026-04-20).
export const MAX_QUAD_SOLID_ANGLE_LITERAL = 3.0e-8;

// LEN0 controls the near-camera fade-out: stars inside LEN0 (in
// scene-space dist) fade to invisibility; stars between LEN0 and
// LEN0×1e3 ramp in via smoothstep (θ.7 hero-star billboard takes
// over inside LEN0 once it ships).
//
// Gaia Sky declares the raw literal `#define LEN0 20000.0` in
// `star.group.quad.vertex.glsl:59`, expressed in Gaia's INTERNAL
// UNITS — a coordinate system where
//     1 pc = PC_TO_M × ORIGINAL_M_TO_U = 3.0857e16 × 1e-9
//          = 3.0857e7 internal_u
// (Constants.java:255 + Nature.java:45). So Gaia's LEN0 represents
// a threshold of `20000 / 3.0857e7 ≈ 6.48e-4 pc ≈ 134 AU`.
//
// Atlas uses a different scene-unit convention: `1 pc =
// DISTANCE_SCALE = 206_265_000 scene_u` (Starfield.tsx:73). To
// preserve the SAME physical distance threshold we must scale the
// Gaia literal by the ratio of scene-unit conventions:
//     LEN0_atlas = 20000 × (206_265_000 / 3.0857e7)
//                = 20000 × 6.6845
//                ≈ 133_689 scene_u
// Initial θ.1b ship copied the `20000.0` literal directly into
// atlas scene units (Math drift audit 2026-04-21 D1). That made the
// threshold ~6.7× too close (≈20 AU vs the intended ≈134 AU), which
// currently has no visible effect because all shipped camera paths
// sit well beyond LEN0×1000 from every HYG star — but is a real
// 1:1 drift and would mis-trigger the θ.7a hero-star LOD when that
// onda ships.
export const GAIA_LEN0_INTERNAL_UNITS = 20000.0;
export const GAIA_INTERNAL_UNITS_PER_PC = 3.0857e16 * 1e-9; // ≈ 3.0857e7
export const ATLAS_SCENE_UNITS_PER_PC = 206_265_000.0;
export const LEN0 =
  GAIA_LEN0_INTERNAL_UNITS *
  (ATLAS_SCENE_UNITS_PER_PC / GAIA_INTERNAL_UNITS_PER_PC);

// GLSL `smoothstep`-style `lint` from Gaia Sky `lib/math.glsl`. Endpoints
// get a smoothstep curve, NOT a linear ramp. This is the authoritative
// shape — `lint2` / `lint3` exist in the lib but the star vertex uses
// `lint` specifically.
const lintSmoothstep = (
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
): number => {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + (y1 - y0) * smoothstep(x0, x1, x);
};

// `degrees12` / `radians12` from Gaia Sky `lib/angles.glsl` — scale by
// 1e12 around `pow()` so we do not lose fp32 precision on solid angles
// in the 1e-10 rad band. `TO_DEG12 = 180.0e12 / PI`, `TO_RAD12 = PI / 180.0e12`.
const TO_DEG12 = 180.0e12 / Math.PI;
const TO_RAD12 = Math.PI / 180.0e12;
const degrees12 = (radians: number) => radians * TO_DEG12;
const radians12 = (degrees: number) => degrees * TO_RAD12;

export interface StarfieldSolidAngleMetrics {
  /** Raw angular size before opacity mapping: `a_size / dist` (radians). */
  rawSolidAngle: number;
  /** Mapped opacity through `lint_smoothstep`, ∈ [opacityLimits.x, opacityLimits.y]. */
  opacity: number;
  /**
   * Clamped solid angle after `radians12(pow(degrees12(_), brightnessPower))`,
   * ∈ [U_MIN_QUAD_SOLID_ANGLE, U_MAX_QUAD_SOLID_ANGLE]. This is the
   * value the vertex uses to compute `quadSize`.
   */
  clampedSolidAngle: number;
  /** Final world-space quad size: `clampedSolidAngle * dist * sizeFactor`. */
  quadSize: number;
  /** Boundary fade: 0 at dist=LEN0, 1 at dist=LEN0×1000 (smoothstep). */
  boundaryFade: number;
  /** Final per-star alpha: clamp(opacity × alphaFactor × boundaryFade, 0, 1). */
  alpha: number;
}

export interface StarfieldSolidAngleInputs {
  /** Per-star Gaia pseudo-size (parsecs × DISTANCE_SCALE × STAR_SIZE_FACTOR, i.e. scene units). */
  size: number;
  /** Camera-to-star distance in the same scene units. */
  dist: number;
  /** `u_solidAngleMap`. Default: `U_SOLID_ANGLE_MAP`. */
  solidAngleMap?: readonly [number, number];
  /** `u_opacityLimits`. Default: `U_OPACITY_LIMITS`. */
  opacityLimits?: readonly [number, number];
  /** `u_brightnessPower`. Default: `U_BRIGHTNESS_POWER_DEFAULT`. */
  brightnessPower?: number;
  /** `u_alphaSizeBr.y` — user size multiplier. Default: 1.0. */
  sizeFactor?: number;
  /** `u_alphaSizeBr.x` — global alpha scale. Default: 1.0. */
  alphaFactor?: number;
  /**
   * `a_fadeAlpha` — M3 cross-fade ramp value. Non-zero on the
   * focused slot once `HygStellarMesh.shouldStellarMeshBeActive`
   * crosses ENTER_RAD; ramps from 0 to 1 over 300 ms. The sprite's
   * alpha is multiplied by `(1 - fadeAlpha)` so it fades out in
   * lockstep with the mesh fading in. Default 0.
   */
  fadeAlpha?: number;
  /**
   * `a_focusMask` — focus identity (1 = focused star slot,
   * 0 = otherwise). T6.4 post-audit P1 follow-up. Set to 1 on
   * starIndex change (BEFORE the mesh gate fires) so the LEN0
   * bypass is active across the entire focus lifetime, not just
   * during the M3 ramp's [0..1] traversal. Without this signal
   * the legacy `dist < LEN0` kill (~134k wu) extinguishes the
   * sprite ~17× before mesh ENTER (~7.7k wu for typical HYG
   * sizes) — the band between is invisible.
   */
  focusMask?: number;
}

/**
 * Pure-TS mirror of the Gaia Sky vertex solid-angle mapping from
 * `star.group.quad.vertex.glsl`. Returns the intermediate and final
 * values the vertex computes, in the same order the shader computes
 * them.
 *
 * Known divergence from the GLSL: we skip the `radians(acos(...))` and
 * `tangent / arctangent` small-angle-approximation branch logic — Gaia
 * Sky's comment "we omit the arctangent and tangent, as per the
 * small-angle approximation" documents that simplification in the
 * source itself, so our math lines up with the shader's actual
 * behaviour for the HYG range.
 */
export const starfieldSolidAngleMetrics = (
  input: StarfieldSolidAngleInputs
): StarfieldSolidAngleMetrics => {
  const size = input.size;
  const dist = Math.max(input.dist, Number.EPSILON);
  const [sMin, sMax] = input.solidAngleMap ?? U_SOLID_ANGLE_MAP;
  const [oMin, oMax] = input.opacityLimits ?? U_OPACITY_LIMITS;
  const power = input.brightnessPower ?? U_BRIGHTNESS_POWER_DEFAULT;
  const sizeFactor = input.sizeFactor ?? 1;
  const alphaFactor = input.alphaFactor ?? 1;
  const fadeAlpha = input.fadeAlpha ?? 0;
  const focusMask = input.focusMask ?? 0;
  // T6.4 post-audit P1 follow-up: focus identity is `focusMask`,
  // NOT `fadeAlpha > 0`. The first round of the fix gated the
  // bypass on fadeAlpha but the LEN0→ENTER_RAD distance band
  // sees fadeAlpha=0 (mesh gate hasn't fired yet) and the
  // bypass missed. Splitting the signals closes the band.
  const isFocused = focusMask > 0.5;

  const rawSolidAngle = size / dist;
  const opacity = lintSmoothstep(rawSolidAngle, sMin, sMax, oMin, oMax);

  // Gaia Sky: `clamp(radians12(pow(degrees12(solidAngle), brightnessPower)),
  //                  u_minQuadSolidAngle, 3.0e-8)`.
  // The degrees12/radians12 wrappers keep precision for pow() operating
  // on values in the 1e-10 band. Without them, pow(1e-10, 1.0) in fp32
  // collapses to zero.
  const boosted = radians12(Math.pow(degrees12(rawSolidAngle), power));
  const clampedSolidAngle = clamp(
    boosted,
    U_MIN_QUAD_SOLID_ANGLE,
    MAX_QUAD_SOLID_ANGLE_LITERAL
  );

  const quadSize = clampedSolidAngle * dist * sizeFactor;

  // Smoothstep-style boundary fade. Far stars fade IN (0 at LEN0, 1 at
  // LEN0·1000). The near-camera check in the shader also nulls the quad
  // when `dist < LEN0`; we return alpha = 0 in that branch too.
  // M3-fix (T6.4 post-audit): the focused star (a_fadeAlpha > 0)
  // bypasses both the boundary-fade and the dist<LEN0 kill so the
  // M3 ramp's `(1 - fadeAlpha)` factor is the sole alpha driver.
  // Without this bypass LEN0 (~133,689 wu) extinguishes the sprite
  // long before mesh ENTER (~7,700 wu for typical HYG sizes),
  // creating a ~17x distance gap where neither sprite nor mesh
  // renders.
  const boundaryFade = isFocused ? 1 : smoothstep(LEN0, LEN0 * 1000, dist);
  let alpha = clamp(opacity * alphaFactor * boundaryFade, 0, 1);
  // M3 cross-fade multiplier — same factor the GLSL applies.
  alpha *= clamp(1 - fadeAlpha, 0, 1);
  if (alpha <= 1e-3 || (!isFocused && dist < LEN0)) alpha = 0;

  return {
    rawSolidAngle,
    opacity,
    clampedSolidAngle,
    quadSize,
    boundaryFade,
    alpha,
  };
};

// -----------------------------------------------------------------------------
// Projection helpers: billboard pixel projection + viewport scalar
// -----------------------------------------------------------------------------
//
// Gaia Sky renders instanced-quad billboards via `snippet/billboard.stretch.glsl`
// (world-space). Atlas now uses the same class of screen-facing instanced
// quads. The helpers below keep the expected pixel projection testable and
// keep the Gaia Sky resolution-adaptive minimum solid angle wired to the
// renderer's actual backbuffer height.

/**
 * Pixels-per-radian factor at unit distance from the camera, for a
 * perspective projection. `projMatrix11 = 1 / tan(fovY / 2) = cot(fovY/2)`
 * as it appears at `projectionMatrix[1][1]` in three.js. `viewportHeight`
 * is the render-buffer height in pixels (CSS pixels × effective DPR).
 *
 *   pixels_per_radian = cot(fovY / 2) × viewportHeight / 2
 *
 * The billboard shader builds a world/view-space quad of full width
 * `solidAngle * dist * u_sizeFactor`. After perspective projection, its
 * expected on-screen width is `solidAngle * u_sizeFactor * pixels_per_radian`.
 */
export const computePixelsPerRadian = (
  projMatrix11: number,
  viewportHeight: number
): number => {
  return projMatrix11 * viewportHeight * 0.5;
};

/**
 * Compute the render-buffer height in physical pixels from CSS-pixel canvas
 * height and the renderer's clamped DPR (via `gl.getPixelRatio()`). Gaia Sky
 * uses the backbuffer height for `u_minQuadSolidAngle`; Atlas mirrors that
 * host-side update even though the star sprite itself is now a billboard quad,
 * not a `gl_PointSize` point.
 */
export const computeViewportHeightScalar = (
  canvasHeightCss: number,
  rendererDpr: number
): number => {
  return Math.max(canvasHeightCss, 0) * Math.max(rendererDpr, 0);
};
