/**
 * Pure-TS mirror of `/tmp/gaiasky/assets/shader/gridrec.fragment.glsl`
 * (MPL-2.0). Extracted ahead of the shader mount so the numeric
 * constants and branch-selectors are pinnable in vitest without
 * spinning up WebGL.
 *
 * Scope: the math helpers the fragment shader references via
 * constants (`N`, `BASE_LINE_WIDTH`, `BASE_COL_DIAG`, `PI`, `RAD`)
 * plus the tiny pure functions the shader inlines (`rotateUV`,
 * `cos(PI * dist)`, `pow(u_heightScale, 0.5)`, etc). The shader port
 * itself (T4.4b) will `import` these so the GLSL literals and their
 * TS mirrors stay in lockstep by construction.
 *
 * Gaia wiring reference (from `ModelEntityRenderSystem.java:310-316`):
 *   - u_tessQuality  = gr.scalingFading.getFirst()   (camera-distance)
 *   - u_heightScale  = gr.scalingFading.getSecond()  (subgrid fade)
 *   - u_elevationMultiplier = recursiveGrid.style.ordinal()
 *       (enum: CIRCULAR = 0, SQUARE = 1)
 *   - u_ts = scene.renderer.line.width * 1.4
 *
 * Default render path (config.yaml:377-384):
 *   - recursiveGrid.origin  = REFSYS
 *   - recursiveGrid.style   = CIRCULAR  ← u_elevationMultiplier = 0
 *
 * So the shader's `if (u_elevationMultiplier < 0.5)` branch — i.e.
 * `circle()` — is Gaia's default render. The `square()` branch
 * ships disabled out-of-the-box and is the style users opt into via
 * the preferences panel.
 */

export const GRIDREC_N = 10.0;
export const GRIDREC_BASE_LINE_WIDTH = 5.0;
export const GRIDREC_RAD = Math.PI / 180.0;

export const GRIDREC_BASE_COL_DIAG: readonly [number, number, number, number] =
  [1.0, 0.492, 0.09, 0.3] as const;

export const GRIDREC_STYLE_CIRCULAR = 0.0;
export const GRIDREC_STYLE_SQUARE = 1.0;
export const GRIDREC_STYLE_BRANCH_THRESHOLD = 0.5;

export const GRIDREC_CIRCLE_DIST_CULL = 40.0;
export const GRIDREC_CIRCLE_CENTER_SMOOTH_STOP = 0.3;
export const GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT = 4.0;

export const GRIDREC_CIRCLE_LEVEL1_F = 10.0;
export const GRIDREC_CIRCLE_LEVEL2_F = 1.0;

export const GRIDREC_SQUARE_LEVEL1_F = 400.0;
export const GRIDREC_SQUARE_LEVEL2_F = 40.0;
export const GRIDREC_SQUARE_LINE_WIDTH_MULT = 2.0;

export const GRIDREC_CROSS_LINE_POW = 2.0;
export const GRIDREC_DIAG_LINE_POW = 3.0;
export const GRIDREC_DIAG_ROTATION_DEG = 45.0;

export const GRIDREC_HEIGHT_SCALE_FADE_EXPONENT = 0.5;

export type GridRecStyle = "CIRCULAR" | "SQUARE";

/**
 * Map Gaia's `recursiveGrid.style` setting to the float uniform the
 * shader branches on. Mirrors
 * `ModelEntityRenderSystem.java:314 style.ordinal()` — CIRCULAR is
 * enum-0, SQUARE is enum-1, threshold `< 0.5` selects CIRCULAR.
 */
export const gridRecStyleToElevationMultiplier = (
  style: GridRecStyle
): number =>
  style === "CIRCULAR" ? GRIDREC_STYLE_CIRCULAR : GRIDREC_STYLE_SQUARE;

/**
 * Rotate a 2D UV around the origin. Source:
 * `gridrec.fragment.glsl:44-47`.
 *   vec2(cos(r)*x + sin(r)*y, cos(r)*y - sin(r)*x)
 */
export const gridRecRotateUV = (
  uvX: number,
  uvY: number,
  rotation: number
): [number, number] => {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [c * uvX + s * uvY, c * uvY - s * uvX];
};

/**
 * Convert Gaia's `tc in [0,1]` (fragment UV) to the shader's internal
 * `tc in [-1,1]` used by both `circle()` and `square()`. Source:
 * `gridrec.fragment.glsl:84` (circle) and line 112 (square, which
 * additionally takes `abs()`).
 */
export const gridRecRemapUvToSigned = (uv: number): number => (uv - 0.5) * 2.0;

/**
 * Radial alpha falloff — identical math in both branches. Source:
 * `gridrec.fragment.glsl:85` (circle) and line 113 (square).
 *   alpha = clamp(1 - pow(length(tc), 4), 0, 1)
 */
export const gridRecRadialAlpha = (tcX: number, tcY: number): number => {
  const len = Math.hypot(tcX, tcY);
  const v = 1.0 - Math.pow(len, GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT);
  return Math.max(0.0, Math.min(1.0, v));
};

/**
 * Sub-grid fade factor driven by u_heightScale. Source:
 * `gridrec.fragment.glsl:87` (circle) and line 115 (square).
 *   fade = pow(u_heightScale, 0.5)
 */
export const gridRecHeightScaleFade = (heightScale: number): number =>
  Math.pow(heightScale, GRIDREC_HEIGHT_SCALE_FADE_EXPONENT);

/**
 * Screen-space line-width in UV units.
 *   circle: lw = |dFdx(tc.x)| * BASE_LINE_WIDTH * u_ts          (line 88)
 *   square: lw = |dFdx(tc.x)| * BASE_LINE_WIDTH * u_ts * 2.0    (line 116)
 * `dFdxTcX` is the absolute value of the partial derivative of tc.x
 * over x-screen, which in shader form the caller computes via
 * `abs(dFdx(tc.x))` — we accept the already-absoluted value for
 * cleaner tests.
 */
export const gridRecLineWidth = (
  absDfdxTcX: number,
  uTs: number,
  style: GridRecStyle
): number => {
  const base = absDfdxTcX * GRIDREC_BASE_LINE_WIDTH * uTs;
  return style === "SQUARE" ? base * GRIDREC_SQUARE_LINE_WIDTH_MULT : base;
};

/**
 * Circle-mode grid function: `cos(PI * dist)` where
 *   coord = tc * d * f * N * 2
 *   dist = length(coord)
 * Source: `gridrec.fragment.glsl:54-55,64`. The caller combines with
 * `smoothstep(factor, 1, func)` downstream.
 */
export const gridRecCircleGridFunc = (
  tcX: number,
  tcY: number,
  d: number,
  f: number
): number => {
  const cx = tcX * d * f * GRIDREC_N * 2.0;
  const cy = tcY * d * f * GRIDREC_N * 2.0;
  const dist = Math.hypot(cx, cy);
  return Math.cos(Math.PI * dist);
};

/**
 * Square-mode grid function: `cos(PI * tc)` per axis, combined
 * `max(x, y)` downstream. Source: `gridrec.fragment.glsl:102`.
 * Note square applies `abs()` to tc first (line 112) and scales by
 * `f * d` before the cosine (line 100) — the helper mirrors this so
 * tests pin the full `cos(PI * abs(tc) * f * d)` on each axis.
 */
export const gridRecSquareGridFunc = (
  tc: number,
  d: number,
  f: number
): number => Math.cos(Math.PI * Math.abs(tc) * f * d);

/**
 * `smoothstep(edge0, edge1, x)` — Three / GLSL semantics. Duplicated
 * here to keep the helper zero-dep; the atlas codebase has other
 * smoothstep mirrors in `lineSdfMath.ts` (inlined) and we want this
 * module's tests to match Gaia exactly even when those helpers
 * change unrelated callers.
 */
export const gridRecSmoothstep = (
  edge0: number,
  edge1: number,
  x: number
): number => {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
};

/**
 * Per-sample radial alpha dampen used in `circle()` only. Source:
 * `gridrec.fragment.glsl:59-61`:
 *   if (dist < 0.3) alpha *= smoothstep(0, 0.3, dist);
 * Dist is `length(coord)` from `gridRecCircleGridFunc`'s internal
 * `coord`, exposed here for test pinning. Returns the multiplier
 * (1.0 when dist ≥ 0.3, `smoothstep(0, 0.3, dist)` otherwise).
 */
export const gridRecCircleCenterAlphaMultiplier = (dist: number): number => {
  if (dist >= GRIDREC_CIRCLE_CENTER_SMOOTH_STOP) return 1.0;
  return gridRecSmoothstep(0.0, GRIDREC_CIRCLE_CENTER_SMOOTH_STOP, dist);
};

/**
 * Distance-cull early-out. Source: `gridrec.fragment.glsl:57-58`:
 *   if (dist > 40) return vec4(0);
 * True = sample fully transparent, caller should short-circuit.
 */
export const gridRecCircleIsCulled = (dist: number): boolean =>
  dist > GRIDREC_CIRCLE_DIST_CULL;
