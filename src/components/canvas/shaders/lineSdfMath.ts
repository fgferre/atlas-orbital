/**
 * Pure-TypeScript mirror of Gaia Sky's quad-strip line SDF feathering
 * math from `/tmp/gaiasky/assets/shader/line.quad.cpu.fragment.glsl:20-33`.
 *
 * Gaia's default line renderer (`config.yaml:243 mode: POLYLINE_QUADSTRIP`)
 * expands polylines into quad strips with per-fragment SDF feathering:
 *
 *   float x = (v_uv.y - 0.5) * 2.0;                     // in [-1, 1]
 *   float core = min(cos(PI * x / 2.0), 1.0 - abs(x));
 *   float alpha = pow(core, 1.8);
 *   float cplus = pow(core, 10.0);
 *   fragColor = vec4(baseColor.rgb + cplus, 1.0) * baseColor.a * alpha;
 *
 * Atlas adapts this to drei's `Line2 + LineMaterial` stack, where
 * `vUv.y` is ALREADY in `[-1, 1]` (LineMaterial's line-perpendicular
 * coordinate convention). That skips Gaia's `(v_uv.y - 0.5) * 2.0`
 * remap — the atlas port of `x` is just `vUv.y` directly.
 *
 * Endcap handling (|x| > 1): Gaia's shader doesn't render endcap
 * regions — the mesh geometry is strictly the quad body. Atlas's
 * LineMaterial renders rounded endcaps when `|vUv.y| > 1` via a
 * separate anti-alias code path; we clamp `1 - |x|` to non-negative
 * so `pow(negative, 1.8)` can't produce NaN inside that region.
 */

/**
 * `line.quad.cpu.fragment.glsl:26` — the SDF shape function.
 * `core = min(cos(PI * x / 2), 1 - |x|)` clamped to 0 at the edges.
 * Returns the raw shape value used by both the alpha falloff and the
 * bright-core boost.
 */
export const lineSdfCore = (x: number): number => {
  const a = Math.cos((Math.PI * x) / 2);
  const b = 1 - Math.abs(x);
  return Math.max(0, Math.min(a, b));
};

/** `line.quad.cpu.fragment.glsl:27 alpha = pow(core, 1.8)`. */
export const LINE_SDF_ALPHA_EXPONENT = 1.8;

/** `line.quad.cpu.fragment.glsl:28 cplus = pow(core, 10.0)`. Bright-core boost (added to RGB). */
export const LINE_SDF_BRIGHT_CORE_EXPONENT = 10.0;

/**
 * Computes the soft-edge alpha multiplier at perpendicular line
 * coordinate `x` ∈ [-1, 1]. Centerline (x=0) → 1.0; edges (|x|=1) → 0.
 */
export const lineSdfAlpha = (x: number): number =>
  Math.pow(lineSdfCore(x), LINE_SDF_ALPHA_EXPONENT);

/**
 * Computes the bright-core additive boost at `x` ∈ [-1, 1].
 * Narrower profile than the alpha; centerline → 1.0, drops sharply.
 * Added to `diffuseColor.rgb` so lines get a crisp bright stripe
 * along their centers without affecting transparency.
 */
export const lineSdfBrightCore = (x: number): number =>
  Math.pow(lineSdfCore(x), LINE_SDF_BRIGHT_CORE_EXPONENT);
