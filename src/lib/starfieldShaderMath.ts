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
export const U_MIN_QUAD_SOLID_ANGLE = 1.0e-10;
// Upper clamp is a SOURCE-LITERAL 3.0e-8 in Gaia Sky's
// star.group.quad.vertex.glsl:105. Not a runtime uniform — inlined in
// both the shader and the TS mirror below so the atlas cannot
// accidentally drift the ceiling away from the source
// (Codex θ.1b review finding #2, 2026-04-20).
export const MAX_QUAD_SOLID_ANGLE_LITERAL = 3.0e-8;

// LEN0 controls the near-camera fade-out: stars inside LEN0 scene units
// fade out (θ.7 hero-star billboard takes over); stars between LEN0 and
// LEN0 × 1e3 ramp in via smoothstep. The raw value `20000.0` in
// `star.group.quad.vertex.glsl` is in Gaia Sky's internal units; we
// apply it in atlas scene units (where 1 pc = DISTANCE_SCALE units)
// with the same literal constant — the fade kicks in at a camera
// distance of ~0.0001 pc from the star, small enough that only the Sun
// and approached hero-stars hit it.
export const LEN0 = 20000.0;

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
  /** Per-star physical radius (parsecs × DISTANCE_SCALE, i.e. scene units). */
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
  const boundaryFade = smoothstep(LEN0, LEN0 * 1000, dist);
  let alpha = clamp(opacity * alphaFactor * boundaryFade, 0, 1);
  if (alpha <= 1e-3 || dist < LEN0) alpha = 0;

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
// Stack/API adaptations: screen-space pixel conversion + viewport scalar
// -----------------------------------------------------------------------------
//
// Gaia Sky renders instanced-quad billboards via `snippet/billboard.stretch.glsl`
// (world-space). Atlas uses `THREE.Points` (pixel-based `gl_PointSize`). The
// two helpers below encode the stack/API adaptation: convert the Gaia Sky
// world-quad pixel equivalent for a THREE.Points sprite. Pinned by tests so
// a future refactor cannot silently drift the conversion (Codex θ.1b review
// finding #4, 2026-04-20).

/**
 * Pixels-per-radian factor at unit distance from the camera, for a
 * perspective projection. `projMatrix11 = 1 / tan(fovY / 2) = cot(fovY/2)`
 * as it appears at `projectionMatrix[1][1]` in three.js. `viewportHeight`
 * is the render-buffer height in pixels (CSS pixels × effective DPR).
 *
 *   pixels_per_radian = cot(fovY / 2) × viewportHeight / 2
 *
 * The shader multiplies this by `solidAngle * u_sizeFactor` to get the
 * final `gl_PointSize` in pixels.
 */
export const computePixelsPerRadian = (
  projMatrix11: number,
  viewportHeight: number
): number => {
  return projMatrix11 * viewportHeight * 0.5;
};

/**
 * Compute the viewport-height scalar uploaded as `u_viewportHeight` in
 * the Starfield vertex. Takes CSS-pixel canvas height and the renderer's
 * clamped DPR (via `gl.getPixelRatio()` — L17 literal). The product is
 * the render-buffer height in physical pixels. Exported for unit
 * testing so the host-side DPR feed is pinnable without a live R3F
 * canvas.
 */
export const computeViewportHeightScalar = (
  canvasHeightCss: number,
  rendererDpr: number
): number => {
  return Math.max(canvasHeightCss, 0) * Math.max(rendererDpr, 0);
};
