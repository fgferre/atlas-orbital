/**
 * Port of `/tmp/gaiasky/assets/shader/gridrec.fragment.glsl` (MPL-2.0)
 * to a Three.js `ShaderMaterial`. Paired with a minimal vertex
 * shader (Gaia uses `shader/default.vertex.glsl` per
 * `RenderAssets.java:211`, but only a tiny slice of that template —
 * UV passthrough + clip-space transform — is actually consumed by
 * the gridrec fragment).
 *
 * Numeric constants come from `./gridRecMath` so the shader literals
 * and TS helpers stay in lockstep by construction (T4.4a ship,
 * `49fdaf0`).
 *
 * GLSL version: written for WebGL1 GLSL 1.00 ES (same convention
 * atlas uses elsewhere — `EclipticGrid.tsx`, `atmosphereShader.ts`).
 * `in`/`out` → `attribute`/`varying`/`gl_FragColor`; no layout
 * qualifiers; standard derivatives (`dFdx`) enabled explicitly via
 * `ShaderMaterial.extensions.derivatives = true`.
 *
 * Scope notes (documented divergences vs Gaia):
 *  - Gaia's `#include <shader/lib/logdepthbuff.glsl>` + manual
 *    `gl_FragDepth = getDepthValue(...)` at line 133 are NOT
 *    ported — the grid sits on a flat plane at z=0 where linear
 *    depth is stable enough at atlas's typical camera ranges. If
 *    T4.4c adds a camera-following quad that extends into
 *    deep-space scales, we re-introduce log-depth via Three's
 *    `<logdepthbuf_*>` ShaderChunks.
 *  - Gaia's `#include <shader/lib/simple_noise.glsl>` is defensive
 *    only — `main()` never calls a noise function. Dropped.
 *  - Gaia's `layout(location = 0) out vec4 fragColor` + the
 *    `layerBuffer` secondary output (declared in `pbr.fragment.glsl`
 *    but not wired in `gridrec`) collapse to `gl_FragColor` for the
 *    single-MRT WebGL1 path.
 *  - Gaia's vertex shader runs a full libGDX lighting pipeline
 *    (shadow maps, point lights, ambient cubemap, relativistic
 *    aberration, gravitational waves). None of those are read by
 *    gridrec.fragment.glsl — the fragment only consumes
 *    `v_texCoords0` and `v_opacity`. Atlas's vertex shader is the
 *    minimum that feeds those two varyings.
 */

import * as THREE from "three";

import {
  GRIDREC_BASE_COL_DIAG,
  GRIDREC_BASE_LINE_WIDTH,
  GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT,
  GRIDREC_CIRCLE_CENTER_SMOOTH_STOP,
  GRIDREC_CIRCLE_DIST_CULL,
  GRIDREC_CIRCLE_LEVEL1_F,
  GRIDREC_CIRCLE_LEVEL2_F,
  GRIDREC_CROSS_LINE_POW,
  GRIDREC_DIAG_LINE_POW,
  GRIDREC_DIAG_ROTATION_DEG,
  GRIDREC_HEIGHT_SCALE_FADE_EXPONENT,
  GRIDREC_N,
  GRIDREC_SQUARE_LEVEL1_F,
  GRIDREC_SQUARE_LEVEL2_F,
  GRIDREC_SQUARE_LINE_WIDTH_MULT,
  GRIDREC_STYLE_BRANCH_THRESHOLD,
  GRIDREC_STYLE_CIRCULAR,
  gridRecStyleToElevationMultiplier,
  type GridRecStyle,
} from "./gridRecMath";

// GLSL floats require a decimal point to parse as `float`, so we
// force it here. `Number.isInteger` + `.0` suffix matches
// Gaia's source style (`#define N 10.0`).
const glslFloat = (value: number): string =>
  Number.isInteger(value) ? `${value}.0` : value.toString();

const vertexShader = /* glsl */ `
  varying vec2 v_texCoords0;
  void main() {
    v_texCoords0 = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  // UNIFORMS — mirror gridrec.fragment.glsl:4-14.
  // Inner / outer ring colors. Atlas defaults mirror Gaia's typical
  // recgrid palette at the GridRecUpdater level; the actual per-body
  // color-fade-in is a runtime driver (T4.4c).
  uniform vec4 u_diffuseColor;   // outer color
  uniform vec4 u_emissiveColor;  // inner color (level-1 fade target)

  // Camera distance encoded in u_tessQuality (gr.scalingFading.first).
  uniform float u_tessQuality;
  // Subgrid fade encoded in u_heightScale (gr.scalingFading.second).
  uniform float u_heightScale;
  // Line width setting (scene.renderer.line.width * 1.4).
  uniform float u_ts;
  // Grid style: 0 = CIRCULAR (concentric rings, Gaia default per
  // config.yaml:384), 1 = SQUARE (uniform grid).
  uniform float u_elevationMultiplier;

  // Output opacity modulation (atlas-added for scene-level fade /
  // layer toggle; Gaia attaches opacity via a vertex varying from
  // the material's ColorAttribute alpha).
  uniform float u_opacity;

  // VARYINGS
  varying vec2 v_texCoords0;

  // CONSTANTS — every literal pinned to gridRecMath.ts (T4.4a
  // ship) so shader and test bench share one source of truth.
  #define GRIDREC_PI 3.141592
  #define GRIDREC_N ${glslFloat(GRIDREC_N)}
  #define GRIDREC_BASE_LINE_WIDTH ${glslFloat(GRIDREC_BASE_LINE_WIDTH)}
  #define GRIDREC_RAD (GRIDREC_PI / 180.0)
  #define GRIDREC_BASE_COL_DIAG vec4(${GRIDREC_BASE_COL_DIAG.map(glslFloat).join(", ")})

  // saturate macro — gridrec.fragment.glsl:42.
  #define gridrec_saturate(x) clamp(x, 0.0, 1.0)

  // rotateUV — gridrec.fragment.glsl:44-47.
  vec2 gridrec_rotateUV(vec2 uv, float rotation) {
    return vec2(
      cos(rotation) * (uv.x) + sin(rotation) * (uv.y),
      cos(rotation) * (uv.y) - sin(rotation) * (uv.x)
    );
  }

  // circle_rec — gridrec.fragment.glsl:49-80.
  vec4 gridrec_circle_rec(
    vec2 tc,
    float lw,
    float d,
    float f,
    float alpha,
    vec4 col,
    vec4 lcol
  ) {
    float factor = (1.0 - lw);

    vec2 tcp = tc * d * f;

    vec2 coord = tcp * GRIDREC_N * 2.0;
    float dist = length(coord);

    if (dist > ${glslFloat(GRIDREC_CIRCLE_DIST_CULL)}) {
      return vec4(0.0);
    } else if (dist < ${glslFloat(GRIDREC_CIRCLE_CENTER_SMOOTH_STOP)}) {
      alpha *= smoothstep(0.0, ${glslFloat(GRIDREC_CIRCLE_CENTER_SMOOTH_STOP)}, dist);
    }

    // The grid in itself.
    float func = cos(GRIDREC_PI * dist);

    // Lines (cross).
    vec2 lines_cross = smoothstep(
      factor,
      1.0,
      pow(1.0 - abs(tc), vec2(${glslFloat(GRIDREC_CROSS_LINE_POW)}))
    );
    vec4 col_cross = lcol * max(lines_cross.x, lines_cross.y);

    // Lines (diagonal).
    vec2 tc_rotated = gridrec_rotateUV(tc, ${glslFloat(GRIDREC_DIAG_ROTATION_DEG)} * GRIDREC_RAD);
    vec2 lines_diag = smoothstep(
      factor,
      1.0,
      pow(1.0 - abs(tc_rotated), vec2(${glslFloat(GRIDREC_DIAG_LINE_POW)}))
    );
    vec4 col_diag = GRIDREC_BASE_COL_DIAG * max(lines_diag.x, lines_diag.y);

    vec4 col_lines = max(col_cross, col_diag);

    vec4 result = max(col * smoothstep(factor, 1.0, func), col_lines);
    result.a *= alpha;
    return result;
  }

  // circle — gridrec.fragment.glsl:82-95.
  vec4 gridrec_circle(vec2 tc) {
    tc = (tc - 0.5) * 2.0;
    float alpha = clamp(
      1.0 - pow(length(tc), ${glslFloat(GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT)}),
      0.0,
      1.0
    );

    float fade = pow(u_heightScale, ${glslFloat(GRIDREC_HEIGHT_SCALE_FADE_EXPONENT)});
    float lw = abs(dFdx(tc.x)) * GRIDREC_BASE_LINE_WIDTH * u_ts;

    // Draw two levels.
    vec4 r01 = gridrec_circle_rec(
      tc,
      lw,
      u_tessQuality,
      ${glslFloat(GRIDREC_CIRCLE_LEVEL1_F)},
      alpha * fade,
      mix(u_emissiveColor, u_diffuseColor, u_heightScale),
      u_diffuseColor
    );
    vec4 r02 = gridrec_circle_rec(
      tc,
      lw,
      u_tessQuality,
      ${glslFloat(GRIDREC_CIRCLE_LEVEL2_F)},
      alpha,
      u_diffuseColor,
      u_diffuseColor
    );

    return max(r01, r02);
  }

  // square_rec — gridrec.fragment.glsl:97-108.
  vec4 gridrec_square_rec(
    vec2 tc,
    float lw,
    float d,
    float f,
    float alpha,
    vec4 col,
    vec4 lcol
  ) {
    float factor = (1.0 - lw);

    tc *= f * d;

    vec2 coord = cos(GRIDREC_PI * tc);

    vec4 result = col * smoothstep(factor, 1.0, max(coord.x, coord.y));
    result = clamp(result, 0.0, 1.0);
    result.a *= alpha;
    return result;
  }

  // square — gridrec.fragment.glsl:110-123.
  vec4 gridrec_square(vec2 tc) {
    tc = abs((tc - 0.5) * 2.0);
    float alpha = clamp(
      1.0 - pow(length(tc), ${glslFloat(GRIDREC_CIRCLE_ALPHA_FALLOFF_EXPONENT)}),
      0.0,
      1.0
    );

    float fade = pow(u_heightScale, ${glslFloat(GRIDREC_HEIGHT_SCALE_FADE_EXPONENT)});
    float lw = abs(dFdx(tc.x))
      * GRIDREC_BASE_LINE_WIDTH
      * u_ts
      * ${glslFloat(GRIDREC_SQUARE_LINE_WIDTH_MULT)};

    // Draw two levels.
    vec4 r01 = gridrec_square_rec(
      tc,
      lw,
      u_tessQuality,
      ${glslFloat(GRIDREC_SQUARE_LEVEL1_F)},
      alpha * fade,
      mix(u_emissiveColor, u_diffuseColor, u_heightScale),
      u_diffuseColor
    );
    vec4 r02 = gridrec_square_rec(
      tc,
      lw,
      u_tessQuality,
      ${glslFloat(GRIDREC_SQUARE_LEVEL2_F)},
      alpha * (1.0 - fade),
      u_diffuseColor,
      u_diffuseColor
    );

    return max(r01, r02);
  }

  // main — gridrec.fragment.glsl:125-134.
  void main() {
    vec4 color;
    if (u_elevationMultiplier < ${glslFloat(GRIDREC_STYLE_BRANCH_THRESHOLD)}) {
      color = gridrec_circle(v_texCoords0);
    } else {
      color = gridrec_square(v_texCoords0);
    }
    color.a *= u_opacity;

    // Depth-buffer write from Gaia main (line 133) skipped — see
    // header JSDoc for divergence rationale (log-depth not ported).

    gl_FragColor = color;
  }
`;

export interface GridRecShaderUniformValues {
  uDiffuseColor: THREE.Vector4;
  uEmissiveColor: THREE.Vector4;
  uTessQuality: number;
  uHeightScale: number;
  uTs: number;
  uElevationMultiplier: number;
  uOpacity: number;
}

export interface GridRecShaderUniformInit {
  diffuseColor?: readonly [number, number, number, number];
  emissiveColor?: readonly [number, number, number, number];
  tessQuality?: number;
  heightScale?: number;
  ts?: number;
  style?: GridRecStyle;
  opacity?: number;
}

/**
 * Default uniforms chosen so the shader self-renders a CIRCULAR
 * grid under Gaia's default `recursiveGrid.style: CIRCULAR`
 * (`config.yaml:384`) when no T4.4c runtime driver is wired.
 *
 * `uTessQuality = 1.0` + `uHeightScale = 1.0` bypasses the
 * camera-distance scaling (every level-1 ring at full fade) so the
 * smoke test can evaluate the fragment-shader correctness in
 * isolation. T4.4c replaces those constants with
 * `getGridScaling(body.distToCamera, ...)`.
 *
 * `uTs = 1.4` mirrors Gaia's `line.width * 1.4` default at
 * `scene.renderer.line.width = 1.0`. `uOpacity = 1.0` leaves the
 * mount component in charge of scene-level fade.
 *
 * Colors: outer `uDiffuseColor` = atlas's established cyan
 * `0x00f0ff` at 80% alpha (mirrors the old `gridMajorColor` in
 * `EclipticGrid.tsx:73` but in linear-space RGBA vec4 form);
 * inner `uEmissiveColor` = same cyan at lower alpha for the
 * level-1 fade target.
 */
export const DEFAULT_GRID_REC_UNIFORMS: Required<GridRecShaderUniformInit> = {
  diffuseColor: [0.0, 0.941176, 1.0, 0.8],
  emissiveColor: [0.0, 0.941176, 1.0, 0.25],
  tessQuality: 1.0,
  heightScale: 1.0,
  ts: 1.4,
  style: "CIRCULAR",
  opacity: 1.0,
};

export const buildGridRecShaderUniforms = (
  init: GridRecShaderUniformInit = {}
): {
  [key: string]: {
    value: GridRecShaderUniformValues[keyof GridRecShaderUniformValues];
  };
} => {
  const merged: Required<GridRecShaderUniformInit> = {
    ...DEFAULT_GRID_REC_UNIFORMS,
    ...init,
  };

  return {
    u_diffuseColor: { value: new THREE.Vector4(...merged.diffuseColor) },
    u_emissiveColor: { value: new THREE.Vector4(...merged.emissiveColor) },
    u_tessQuality: { value: merged.tessQuality },
    u_heightScale: { value: merged.heightScale },
    u_ts: { value: merged.ts },
    u_elevationMultiplier: {
      value: gridRecStyleToElevationMultiplier(merged.style),
    },
    u_opacity: { value: merged.opacity },
  };
};

/**
 * Build the `ShaderMaterial` that renders Gaia's recursive grid on
 * a unit UV quad. Caller is responsible for mesh + transform; this
 * factory only owns the GLSL + uniform contract.
 */
export const buildGridRecShaderMaterial = (
  init?: GridRecShaderUniformInit
): THREE.ShaderMaterial => {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: buildGridRecShaderUniforms(init),
    vertexShader,
    fragmentShader,
  });

  // `dFdx` requires GL_OES_standard_derivatives on WebGL1. Three
  // sets this automatically for WebGL2 but not WebGL1, so opt in
  // explicitly for parity with EclipticGrid.tsx's pattern.
  (material.extensions as { derivatives?: boolean }).derivatives = true;
  material.toneMapped = false;

  return material;
};

export const GRID_REC_VERTEX_SHADER = vertexShader;
export const GRID_REC_FRAGMENT_SHADER = fragmentShader;
export { GRIDREC_STYLE_CIRCULAR };
