import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

import { MAX_LIGHTS } from "../../../../lib/lightRegistry";
import { getLightGlowSprite } from "./lightGlowSprite";

/**
 * Gaia Sky LightGlow post-process port (θ.3). 1:1 port of
 * `assets/shader/postprocess/lightglow.frag.glsl` +
 * `lightglow.vert.glsl`, with one documented engineering choice:
 *
 * **Fragment-stage Archimedean spiral sampling.** Gaia Sky's vertex
 * shader computes per-light `v_lums[N]` via an Archimedean spiral
 * around each `u_lightPositions[li]` (30 samples in internal default,
 * `config.yaml samples: 10` for user tier), then passes the array to
 * the fragment via a varying. The computation is uniform-constant per
 * frame, so moving it to fragment-stage is a correctness-preserving
 * re-arrangement (same math, same output). Fragment-stage fits the
 * pmndrs `Effect` base class, which does not expose a custom
 * vertex-shader slot for full-screen passes.
 *
 * Everything else is literal:
 *   - Same spiral parameters: `t ∈ [0, 3π]`, `dt = 3π / n`,
 *     `fx = a·t·cos(t)`, `fy = a·t·sin(t)`.
 *   - Same 0.95 luma threshold via `step(0.95, value)` gate.
 *   - Same polar-mask frequencies (12, 37, 59) and time multipliers
 *     (2.0, −1.3, 1.6).
 *   - Same `minVal = 0.55` floor on the polar mask.
 *   - Same centre smoothstep (0.85, 1.0).
 *   - Same size formula
 *     `u_textureScale * min(1.6, viewAngle * 5e5) * lum`.
 *
 * Output: additive glow contribution. The pmndrs `Effect` pipeline
 * blends this with the scene via `BlendFunction.ADD`, so we do NOT
 * include Gaia's final `saturate(effectColor + scene)` — keeping the
 * scene HDR intact for downstream Bloom (atlas adaptation; Gaia's
 * default `bloom.intensity = 0` made the saturate irrelevant there).
 *
 * Source-literal defaults (verified 2026-04-21 against /tmp/gaiasky):
 *   - `u_nSamples = 10`  (config.yaml postprocess.lightGlow.samples)
 *   - `u_textureScale = 2.22 × (0.055/0.06) × 0.2 = 0.407`
 *     (MainPostProcessor.java:552 getGlowTextureScale with
 *     ss.brightness=2.22, ss.glowFactor=0.055, non-cubemap path)
 *   - `u_spiralScale = 2.22 × 3.0 × 0.5e-4 = 3.33e-4`
 *     (MainPostProcessor.java:562 getGlowSpiralScale with
 *     ss.brightness=2.22, ss.pointSize=3.0, fovFactor=1.0)
 *   - `u_orientation = 0` (Gaia Sky disables the orientation animation
 *     in the final shader — comment block in lightglow.frag.glsl).
 *   - `u_backbufferScale = 1.0` (non-OpenXR path).
 */

export const LIGHT_GLOW_DEFAULT_SAMPLES = 10;
export const LIGHT_GLOW_DEFAULT_TEXTURE_SCALE = 2.22 * (0.055 / 0.06) * 0.2;
export const LIGHT_GLOW_DEFAULT_SPIRAL_SCALE = 2.22 * 3.0 * 0.5e-4;
export const LIGHT_GLOW_DEFAULT_BACKBUFFER_SCALE = 1.0;
export const LIGHT_GLOW_POLAR_MASK_MIN_VAL = 0.55;

/**
 * Polar-mask frequencies (hard-coded in `lightglow.frag.glsl`). Kept
 * as an export so the executable TS mirror in
 * `lightGlowMath.ts` tests can pin them without drift.
 */
export const LIGHT_GLOW_POLAR_FREQS: Readonly<[number, number, number]> = [
  12.0, 37.0, 59.0,
];
/** Time multipliers for each polar frequency (also hard-coded). */
export const LIGHT_GLOW_POLAR_TIME_MULS: Readonly<[number, number, number]> = [
  2.0, -1.3, 1.6,
];

/**
 * Fragment shader — ports both the vertex-stage spiral sampling (now
 * inlined at the top of `mainImage`) and the fragment-stage halo
 * rendering 1:1.
 *
 * pmndrs `Effect` convention:
 *   - `mainImage(uv, inputColor, outputColor)` is the hook.
 *   - `uv` is the current fragment's UV in [0, 1].
 *   - `inputColor` is the scene's colour at this UV.
 *   - `outputColor` is what we write; pmndrs blends it per `blendFunction`.
 *   - Samplers we declare are auto-bound.
 *   - `resolution` uniform is auto-provided.
 */
const fragmentShader = /* glsl */ `
  #define N 8

  uniform int u_nLights;
  uniform int u_nSamples;
  uniform float u_spiralScale;
  uniform float u_textureScale;
  uniform float u_backbufferScale;
  uniform float u_orientation;
  uniform vec2 u_lightPositions[N];
  uniform float u_lightViewAngles[N];
  uniform vec3 u_lightColors[N];
  uniform sampler2D u_lightGlowTexture;
  uniform float u_timeSeconds;

  // Gaia Sky lib/luma.glsl  \`luma\` definition (sRGB weights).
  float gaiaLuma(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  float fx(float t, float a) {
    return a * t * cos(t);
  }

  float fy(float t, float a) {
    return a * t * sin(t);
  }

  vec4 starImage(vec2 tc) {
    // Gaia leaves the orientation rotation commented out; mirror that.
    return texture2D(u_lightGlowTexture, tc);
  }

  float polarMask(vec2 uvCenter, float time) {
    vec2 p = uvCenter * 2.0 - 1.0;
    float r = length(p);
    vec2 d = normalize(p);

    float angularMask =
      0.5
      + 0.25 * sin(d.x * 12.0 + time * 2.0)
      + 0.20 * cos(d.y * 37.0 - time * 1.3)
      + 0.10 * sin((d.x + d.y) * 59.0 + time * 1.6);

    angularMask = (angularMask + 1.0) * 0.5;
    float minVal = 0.55;
    angularMask = minVal + (1.0 - minVal) * angularMask;

    float center = smoothstep(0.85, 1.0, 1.0 - r);
    return clamp(angularMask + center, minVal, 1.0);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Gaia uses \`resolution\` (provided by pmndrs) for aspect ratio.
    float ar = resolution.x / resolution.y;

    // Spiral sampling (moved from vertex to fragment; see class-level
    // doc for why this is a correctness-preserving rearrangement).
    float lums[N];
    for (int li = 0; li < N; li++) {
      if (li >= u_nLights) {
        lums[li] = 0.0;
        continue;
      }
      float a = u_spiralScale;
      float t = 0.0;
      float dt = 3.0 * 3.14159 / float(u_nSamples);
      float th = 0.95;
      float lum = 0.0;
      for (int idx = 0; idx < 64; idx++) {
        if (idx >= u_nSamples) break;
        vec2 curr_coord = clamp(
          u_lightPositions[li] + vec2(fx(t, a) / ar, fy(t, a)),
          0.0,
          1.0
        );
        float value = gaiaLuma(texture2D(inputBuffer, curr_coord).rgb);
        lum += step(th, value) * value;
        t += dt;
      }
      // Gaia Sky samples one extra point post-loop (bonus sample).
      float value = gaiaLuma(
        texture2D(
          inputBuffer,
          u_lightPositions[li] + vec2(fx(t, a) / ar, fy(t, a) * ar)
        ).rgb
      );
      lum += step(th, value) * value;
      lum /= float(u_nSamples);
      lums[li] = clamp(lum, 0.0, 1.0);
    }

    // Halo rendering per light (fragment-local).
    vec3 effectColor = vec3(0.0);
    for (int li = 0; li < N; li++) {
      if (li >= u_nLights) break;

      float lum = lums[li];
      vec3 lightColor = u_lightColors[li];
      float viewAngle = min(0.0001, u_lightViewAngles[li]);
      float size = u_textureScale * min(1.6, viewAngle * 5.0e5) * lum;

      vec2 glow_tc = (uv * u_backbufferScale - u_lightPositions[li]);
      glow_tc.x *= ar;
      float dist_center = length(glow_tc);
      glow_tc /= max(size, 1e-6);
      glow_tc += 0.5;

      float mask = polarMask(glow_tc, u_timeSeconds);
      vec4 glow = starImage(glow_tc);
      glow.rgb *= mask;
      float glow_value = dot(glow.rgb, vec3(0.2126, 0.7152, 0.0722));
      float core_inc = (0.1 - min(0.1, dist_center)) * glow_value;
      effectColor += vec3(
        glow_value * lightColor.r + core_inc,
        glow_value * lightColor.g + core_inc,
        glow_value * lightColor.b + core_inc
      );
    }

    // ADD-blend via pmndrs — output the glow contribution CLAMPED to
    // [0, 1] so the downstream Bloom threshold only fires on genuine
    // emissive scene content, not on LightGlow peaks. Gaia's literal
    // is \`saturate(effectColor + scene)\` which clamps the combined
    // sum; we clamp only the contribution (preserving scene HDR for
    // the Bloom allow-list). Codex audit 2026-04-21 accepted this as
    // a documented HDR-preservation divergence.
    outputColor = vec4(clamp(effectColor, 0.0, 1.0), inputColor.a);
  }
`;

/**
 * Custom pmndrs `Effect` implementing Gaia Sky's LightGlow post-
 * process. Exposes imperative setters matching `GlowFilter.java`:
 * `setLightData(n, positions, viewAngles, colors)` +
 * `setTime(seconds)`.
 */
export class LightGlowEffect extends Effect {
  constructor(options?: {
    samples?: number;
    textureScale?: number;
    spiralScale?: number;
    backBufferScale?: number;
  }) {
    const defines = new Map<string, string>([["N", String(MAX_LIGHTS)]]);
    const uniforms = new Map<string, THREE.Uniform>([
      ["u_nLights", new THREE.Uniform(0)],
      [
        "u_nSamples",
        new THREE.Uniform(options?.samples ?? LIGHT_GLOW_DEFAULT_SAMPLES),
      ],
      [
        "u_spiralScale",
        new THREE.Uniform(
          options?.spiralScale ?? LIGHT_GLOW_DEFAULT_SPIRAL_SCALE
        ),
      ],
      [
        "u_textureScale",
        new THREE.Uniform(
          options?.textureScale ?? LIGHT_GLOW_DEFAULT_TEXTURE_SCALE
        ),
      ],
      [
        "u_backbufferScale",
        new THREE.Uniform(
          options?.backBufferScale ?? LIGHT_GLOW_DEFAULT_BACKBUFFER_SCALE
        ),
      ],
      ["u_orientation", new THREE.Uniform(0)],
      ["u_lightPositions", new THREE.Uniform(new Float32Array(MAX_LIGHTS * 2))],
      ["u_lightViewAngles", new THREE.Uniform(new Float32Array(MAX_LIGHTS))],
      ["u_lightColors", new THREE.Uniform(new Float32Array(MAX_LIGHTS * 3))],
      ["u_lightGlowTexture", new THREE.Uniform(getLightGlowSprite())],
      ["u_timeSeconds", new THREE.Uniform(0)],
    ]);

    super("LightGlowEffect", fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.ADD,
      defines,
      uniforms,
    });
  }

  /** Update the per-frame light arrays + count. */
  setLightData(
    nLights: number,
    positions: Float32Array,
    viewAngles: Float32Array,
    colors: Float32Array
  ): void {
    const nSlot = this.uniforms.get("u_nLights");
    const pos = this.uniforms.get("u_lightPositions");
    const ang = this.uniforms.get("u_lightViewAngles");
    const col = this.uniforms.get("u_lightColors");
    if (nSlot) nSlot.value = nLights;
    if (pos) pos.value = positions;
    if (ang) ang.value = viewAngles;
    if (col) col.value = colors;
  }

  /** Advance the `u_timeSeconds` clock for polar-mask animation. */
  setTime(seconds: number): void {
    const t = this.uniforms.get("u_timeSeconds");
    if (t) t.value = seconds;
  }

  /**
   * Adjust the halo size multiplier. Maps to Gaia Sky's
   * `GlowFilter.setTextureScale` at `GlowFilter.java:91`.
   */
  setTextureScale(scale: number): void {
    const s = this.uniforms.get("u_textureScale");
    if (s) s.value = scale;
  }

  /**
   * Adjust the spiral sampling radius. Maps to Gaia Sky's
   * `GlowFilter.setSpiralScale` at `GlowFilter.java:96`.
   */
  setSpiralScale(scale: number): void {
    const s = this.uniforms.get("u_spiralScale");
    if (s) s.value = scale;
  }
}
