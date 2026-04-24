import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

import { MAX_LIGHTS } from "../../../../lib/lightRegistry";
import { getLightGlowSprite } from "./lightGlowSprite";

/**
 * Gaia Sky LightGlow post-process port (θ.3). 1:1 port of
 * `assets/shader/postprocess/lightglow.frag.glsl` +
 * `lightglow.vert.glsl`.
 *
 * **T5.3b shipped 2026-04-24**: per-light `v_lums` spiral sampling
 * moved from the fragment stage back to the vertex stage, matching
 * Gaia's original architecture at `lightglow.vert.glsl:49-78`. The
 * pre-T5.3b atlas port ran the spiral loop inside `mainImage` — ~3M
 * fragments × N lights × 2 texture samples per frame. The 2026-04-24
 * audit measured this at ~400M texture samples/sec per active light
 * at 1080p/60Hz; the vertex-stage move drops that to 4 vertices × N
 * × 2 = ≤64 samples/frame (vanishing noise-floor cost).
 *
 * The pre-T5.3b rationale ("pmndrs `Effect` does not expose a custom
 * vertex-shader slot") turned out to be obsolete — pmndrs does
 * support per-Effect custom vertex shaders via the `mainSupport(uv)`
 * convention (see the stdlib FXAA / SMAA / Chromatic Aberration
 * effects), AND extracts `varying` declarations from the custom
 * vertex shader + adds them to the composed program (see
 * `postprocessing/build/postprocessing.js:15381-15395 integrateEffect`).
 *
 * Atlas packs the 8-light `v_lums` array into 2× `vec4` varyings
 * (`v_lumsA` for lights 0..3, `v_lumsB` for lights 4..7) rather than
 * a `float[8]` array varying. pmndrs' varying-extraction regex
 * handles both, but scalar array varyings are fragile across GPU
 * drivers — packed vec4s are the bulletproof format every
 * shader pipeline supports, and cost nothing semantically (scalar
 * access via `.x/.y/.z/.w` in the fragment is trivial).
 *
 * Everything else stays literal:
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
 *   - `u_nSamples = 1`   (MainPostProcessor.updateGlow() forces the
 *     runtime LightGlow sample count to 1 after construction)
 *   - `u_textureScale = 2.22 × (0.055/0.06) × 0.2 = 0.407`
 *     (MainPostProcessor.java:552 getGlowTextureScale with
 *     ss.brightness=2.22, ss.glowFactor=0.055, non-cubemap path)
 *   - `u_spiralScale = 2.22 × 3.0 × 0.5e-4 = 3.33e-4`
 *     (MainPostProcessor.java:562 getGlowSpiralScale with
 *     ss.brightness=2.22, ss.pointSize=3.0, fovFactor=1.0)
 *   - `u_orientation = 0` (Gaia Sky disables the orientation animation
 *     in the final shader — comment block in lightglow.frag.glsl).
 *   - `u_backbufferScale = 1.0` (non-OpenXR path).
 *
 * **MAX_LIGHTS = 8 assumption.** The vec4 packing below hard-codes
 * the 2-varying layout for exactly 8 slots. If
 * `src/lib/lightRegistry.ts MAX_LIGHTS` ever changes, this file
 * needs a matching update (test pins the invariant at module load).
 */

export const LIGHT_GLOW_DEFAULT_SAMPLES = 1;
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
 * **Vertex shader** (T5.3b) — ports Gaia's `lightglow.vert.glsl:49-78`
 * spiral-sampling pass. pmndrs calls `mainSupport(vUv)` from its
 * composed vertex shader (see
 * `postprocessing/build/postprocessing.js:15381-15395`). Runs 4
 * times per frame (fullscreen quad corners). Each invocation walks
 * the Archimedean spiral around each light and samples `inputBuffer`
 * in the vertex stage — WebGL 2 supports vertex texture fetch.
 *
 * Output varyings `v_lumsA` / `v_lumsB` pack 8 per-light lums into
 * two vec4s (N=8 is pinned by `MAX_LIGHTS` in `lightRegistry.ts`).
 * All 4 vertices write the same values (sampling inputs don't
 * depend on vertex position), so the interpolated fragment value
 * is the same scalar → correct behavior with no fragment-stage
 * recomputation cost.
 *
 * `inputBuffer` is declared in both stages; three.js's program
 * linker binds it once per WebGLTexture, so fragment + vertex share
 * the same sampler.
 */
const vertexShader = /* glsl */ `
  uniform sampler2D inputBuffer;
  uniform int u_nLights;
  uniform int u_nSamples;
  uniform float u_spiralScale;
  uniform vec2 u_lightPositions[N];

  varying vec4 v_lumsA;
  varying vec4 v_lumsB;

  float vtxGaiaLuma(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  float vtxFx(float t, float a) {
    return a * t * cos(t);
  }

  float vtxFy(float t, float a) {
    return a * t * sin(t);
  }

  float computeLumForLight(int li, float ar) {
    if (li >= u_nLights) return 0.0;
    float a = u_spiralScale;
    float t = 0.0;
    float dt = 3.0 * 3.14159 / float(u_nSamples);
    float th = 0.95;
    float lum = 0.0;
    for (int idx = 0; idx < 64; idx++) {
      if (idx >= u_nSamples) break;
      vec2 curr_coord = clamp(
        u_lightPositions[li] + vec2(vtxFx(t, a) / ar, vtxFy(t, a)),
        0.0,
        1.0
      );
      float value = vtxGaiaLuma(texture2D(inputBuffer, curr_coord).rgb);
      lum += step(th, value) * value;
      t += dt;
    }
    // Gaia Sky samples one extra point post-loop (bonus sample).
    float value = vtxGaiaLuma(
      texture2D(
        inputBuffer,
        u_lightPositions[li] + vec2(vtxFx(t, a) / ar, vtxFy(t, a) * ar)
      ).rgb
    );
    lum += step(th, value) * value;
    lum /= float(u_nSamples);
    return clamp(lum, 0.0, 1.0);
  }

  void mainSupport(const in vec2 uv) {
    float ar = resolution.x / resolution.y;
    v_lumsA = vec4(
      computeLumForLight(0, ar),
      computeLumForLight(1, ar),
      computeLumForLight(2, ar),
      computeLumForLight(3, ar)
    );
    v_lumsB = vec4(
      computeLumForLight(4, ar),
      computeLumForLight(5, ar),
      computeLumForLight(6, ar),
      computeLumForLight(7, ar)
    );
  }
`;

/**
 * Fragment shader — halo rendering (pure per-fragment work). Reads
 * `v_lumsA` / `v_lumsB` varyings populated by the vertex-stage
 * spiral sampling.
 *
 * pmndrs `Effect` convention:
 *   - `inputColor` is the scene's colour at this UV.
 *   - `mainImage(inputColor, uv, outputColor)` is the hook.
 *   - `uv` is the current fragment's UV in [0, 1].
 *   - `outputColor` is what we write; pmndrs blends it per `blendFunction`.
 *   - Samplers we declare are auto-bound.
 *   - `resolution` uniform is auto-provided.
 */
const fragmentShader = /* glsl */ `
  uniform int u_nLights;
  uniform float u_textureScale;
  uniform float u_backbufferScale;
  uniform float u_orientation;
  uniform vec2 u_lightPositions[N];
  uniform float u_lightViewAngles[N];
  uniform vec3 u_lightColors[N];
  uniform sampler2D u_lightGlowTexture;
  uniform float u_timeSeconds;

  varying vec4 v_lumsA;
  varying vec4 v_lumsB;

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

  // Unpack N=8 per-light lums from the two vec4 varyings. Indexed by
  // \`li\` which comes from the per-light halo loop below.
  float getLum(int li) {
    if (li == 0) return v_lumsA.x;
    if (li == 1) return v_lumsA.y;
    if (li == 2) return v_lumsA.z;
    if (li == 3) return v_lumsA.w;
    if (li == 4) return v_lumsB.x;
    if (li == 5) return v_lumsB.y;
    if (li == 6) return v_lumsB.z;
    return v_lumsB.w;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Gaia uses \`resolution\` (provided by pmndrs) for aspect ratio.
    float ar = resolution.x / resolution.y;

    // Halo rendering per light (fragment-local).
    vec3 effectColor = vec3(0.0);
    for (int li = 0; li < N; li++) {
      if (li >= u_nLights) break;

      float lum = getLum(li);
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
      vertexShader,
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
