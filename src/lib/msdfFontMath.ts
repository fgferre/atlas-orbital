/**
 * Pure-TS mirror of Gaia Sky's MSDF font fragment shader
 * (`/tmp/gaiasky/assets/shader/font.fragment.glsl`, MPL-2.0, 41 LOC).
 *
 * Scope: the SDF math primitives Gaia uses to render crisp bitmap
 * text at any scale via a signed-distance-field texture:
 *   - `msdfSmoothing(scale)` — adaptive anti-aliasing width.
 *   - `msdfAlpha(dist, smoothing, opacity)` — the `smoothstep(0.6-s,
 *     0.6+s, dist) * opacity` formula that produces crisp edges.
 *   - `msdfShouldDiscardOpacity` / `msdfShouldDiscardAlpha` — the
 *     two early-discard checks at `.001` threshold.
 *   - `msdfPremultiply(rgb, alpha)` — additive-blend premultiply.
 *
 * **Source citations** (all under
 * `/tmp/gaiasky/assets/shader/font.fragment.glsl`):
 *   - Line 21-23: `if (v_opacity < 0.001) discard;`
 *     → `MSDF_MIN_OPACITY_DISCARD = 0.001`.
 *   - Line 26: `float smoothing = 1.0 / (16.0 * u_scale);`
 *     → `MSDF_SMOOTHING_DIVISOR = 16.0`.
 *   - Line 28: `smoothstep(0.6 - smoothing, 0.6 + smoothing, dist)`
 *     → `MSDF_SDF_THRESHOLD = 0.6`.
 *   - Line 31-33: `if (alpha < 0.001) discard;`
 *     → same `MSDF_MIN_OPACITY_DISCARD` constant.
 *   - Line 37: `layerBuffer = vec4(v_color.rgb, 1.0) * alpha;`
 *     → `msdfPremultiply(rgb, alpha) = [rgb × alpha, alpha]`.
 *
 * **Why extract now** (T4.5-α): the T4.4b predecessor sweep removed
 * `EclipticGrid.tsx`'s canvas-texture AU tick labels (1/2/5/10/20/
 * 30/40 AU sprites). Gaia-native label rendering goes through this
 * SDF pipeline instead of canvas-textured sprites. Pinning the math
 * here sets up T4.5-β (drei `<Text>` integration) + T4.5-γ
 * (constellation lines) + T4.5-δ (AU tick re-mount via SDF text).
 *
 * **Relationship to drei `<Text>`**: drei wraps
 * `troika-three-text`, which ships its own SDF fragment shader.
 * Its default smoothing formula differs from Gaia's (troika uses
 * `fwidth(distance)` for device-pixel-ratio adaptation; Gaia uses
 * a fixed `1 / (16 * u_scale)` inverse-scale formula). T4.5-β will
 * decide whether to use troika's default smoothing or override with
 * Gaia's formula via `troika-three-text`'s `uniforms` hook. Having
 * these constants pinned in TS lets us pass them as uniforms if we
 * pick the Gaia-parity path.
 */

/** `font.fragment.glsl:26` — `smoothing = 1 / (16 × u_scale)`. */
export const MSDF_SMOOTHING_DIVISOR = 16.0;

/** `font.fragment.glsl:28` — `smoothstep(0.6 ± smoothing, dist)`. */
export const MSDF_SDF_THRESHOLD = 0.6;

/** `font.fragment.glsl:21,31` — both opacity + final-alpha discard thresholds. */
export const MSDF_MIN_OPACITY_DISCARD = 0.001;

/**
 * Screen-size-adaptive anti-aliasing width.
 *
 * `u_scale` in Gaia's shader represents the text's RENDERED pixel
 * scale (larger `u_scale` → bigger on-screen text → narrower
 * smoothing band → crisper edges). Callers should pass the ratio of
 * the text's target pixel size to some reference — e.g., `pixelSize
 * / 16` for "normalized at a 16-pixel baseline". The exact scale
 * convention is a T4.5-β concern; α pins the formula.
 */
export const msdfSmoothing = (scale: number): number =>
  1.0 / (MSDF_SMOOTHING_DIVISOR * scale);

/**
 * GLSL `smoothstep(edge0, edge1, x)` mirror with the same
 * semantics: Hermite cubic between `edge0` and `edge1`, clamped
 * outside `[edge0, edge1]`. Duplicated locally so this module
 * stays zero-dep and the test bench pins Gaia behavior without
 * depending on a shared helper module whose semantics could drift.
 */
export const msdfSmoothstep = (
  edge0: number,
  edge1: number,
  x: number
): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Port of `font.fragment.glsl:28`:
 *   alpha = smoothstep(threshold - smoothing, threshold + smoothing,
 *                      dist) * opacity
 *
 * `dist` is the SDF-texture alpha-channel sample (range [0, 1]
 * where 0.5 is the glyph edge in a standard SDF atlas; Gaia's
 * threshold of 0.6 biases toward slightly thinner strokes than
 * the mid-point convention).
 */
export const msdfAlpha = (
  dist: number,
  smoothing: number,
  opacity: number
): number =>
  msdfSmoothstep(
    MSDF_SDF_THRESHOLD - smoothing,
    MSDF_SDF_THRESHOLD + smoothing,
    dist
  ) * opacity;

/**
 * Early-discard check on `v_opacity` (font.fragment.glsl:21-23).
 * Returns true when the caller should skip fragment rendering.
 */
export const msdfShouldDiscardOpacity = (opacity: number): boolean =>
  opacity < MSDF_MIN_OPACITY_DISCARD;

/**
 * Final-alpha discard check (font.fragment.glsl:31-33). Runs AFTER
 * `msdfAlpha` computes the combined smoothstep × opacity value;
 * short-circuits fragments in the `< 0.001` tail so the layerBuffer
 * doesn't accumulate imperceptible contributions.
 */
export const msdfShouldDiscardAlpha = (alpha: number): boolean =>
  alpha < MSDF_MIN_OPACITY_DISCARD;

/**
 * Port of `font.fragment.glsl:37` — premultiplied alpha for additive
 * blending against the layerBuffer:
 *   `layerBuffer = vec4(v_color.rgb, 1.0) * alpha;`
 *
 * Note that Gaia multiplies by `alpha` AFTER folding `v_color.a` in
 * at line 36 (`alpha *= v_color.a;`), so the RGB components see
 * `rgb × alpha × color_alpha` and the alpha channel goes from 1.0
 * to `alpha × color_alpha`. This helper takes the final alpha the
 * caller has already combined with the color alpha.
 */
export const msdfPremultiply = (
  rgb: readonly [number, number, number],
  alpha: number
): [number, number, number, number] => [
  rgb[0] * alpha,
  rgb[1] * alpha,
  rgb[2] * alpha,
  alpha,
];
