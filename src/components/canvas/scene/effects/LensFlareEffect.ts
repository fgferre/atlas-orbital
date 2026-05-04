import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

import { getLensDirtSprite, getLensStarburstSprite } from "./lensFlareSprites";
import { PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD } from "./PseudoLensFlareEffect";

/**
 * Gaia Sky COMPLEX lens-flare (T2.1 port).
 *
 * Gaia's DEFAULT `lensFlare.type` per `config.yaml:606` is `COMPLEX`
 * — the shader at `assets/shader/postprocess/lensflare.frag.glsl`
 * `#ifdef complexLensFlare` branch (lines 84-161). Completely different
 * rendering from PSEUDO's ghost-march (what θ.4 ported as
 * `PseudoLensFlareEffect`): COMPLEX is driven by per-light SCREEN-SPACE
 * positions, accumulating 10 iterations of `circle()` sin-wave-coloured
 * rings + polygonal sprites per light, then multiplying by a
 * distance-based smoothstep mask.
 *
 * Pipeline (matches `LensFlare.java:112-141`):
 *   1. 6-sample Archimedean-spiral luma check around each light (scene
 *      sampled via `inputBuffer`) → per-light occlusion intensity.
 *   2. Call `lens_flare(uv, intensity × lum × light_intensity,
 *      light_pos)` per light → accumulates COMPLEX ring/circle field.
 *   3. Clamp to [0, 1].
 *   4. (atlas-inlined, matching Gaia's separate `LensDirtFilter` call)
 *      Multiply flare layer by `(dirt × 3 + starburst)` and apply
 *      `u_flareIntensity` scalar before ADD-blending onto scene.
 *
 * pmndrs architectural adaptation: Gaia uses a separate `PingPongBuffer`
 * to keep the flare layer distinct from the scene so `LensDirtFilter`
 * only modulates the flare. pmndrs Effects chain linearly — every
 * effect sees the same scene buffer. To preserve "dirt modulates the
 * flare, not the scene" semantics, the dirt multiply is inlined here
 * (same pattern used by `PseudoLensFlareEffect` for the same reason
 * — see its doc comment at lines 26-38). `BlendFunction.ADD` at the
 * composer level then layers the modulated flare onto the scene.
 *
 * Shader port decisions:
 *   - SIMPLE branch (`lensflare.frag.glsl:21-82`) NOT ported. Atlas
 *     follows `config.yaml:606 type: COMPLEX` as the Gaia-default
 *     (rule `feedback_default_gaia_fidelity.md`). SIMPLE could be
 *     added as a second variant but isn't on the Lens Closure Wave.
 *   - `#define complexLensFlare` + `#define useLensDirt` baked in at
 *     compile time (Gaia's runtime `StringBuilder` pattern at
 *     `LensFlareFilter.java:37-48`). STRENGTH inside COMPLEX then
 *     resolves to `0.35` per `lensflare.frag.glsl:89-92`.
 *   - `u_color = vec3(1, 1, 1)` hardcoded (Gaia default at
 *     `LensFlareFilter.java:32`). Atlas doesn't expose a tint at this
 *     point; the circle colour oscillates via `cos(vec3(...) × 8 +
 *     dist × 4)` regardless of `u_color` (it's additive / positional
 *     inside the COMPLEX branch — matches Gaia 1:1).
 *   - `u_viewport` passed in pixel units, matching
 *     `LensFlareFilter.java:30,51`. Consumed only for aspect-ratio
 *     correction (`ar = viewport.x / viewport.y`).
 *   - `MAX_LIGHTS = 10` matching `lensflare.frag.glsl:8`.
 *   - `N_SAMPLES = 6` spiral luma check matching
 *     `lensflare.frag.glsl:173`. Constant `a = 0.01`, `dt = 3π / 6`
 *     per lines 187-188.
 *   - `u_flareIntensity` scalar (atlas-added) applied as the final
 *     multiplier, matching Gaia's `CombineFilter.setSource2Intensity`
 *     pattern at `LensFlare.java:140`. Default `1.0` = no scaling
 *     (the shader's own `STRENGTH = 0.35` already matches Gaia's
 *     `useLensDirt` calibration).
 */

/** Matches `lensflare.frag.glsl:8 #define MAX_LIGHTS 10`. */
export const LENS_FLARE_MAX_LIGHTS = 10;

/** Matches `lensflare.frag.glsl:173 #define N_SAMPLES 6`. */
export const LENS_FLARE_OCCLUSION_SAMPLES = 6;

/** Matches `lensflare.frag.glsl:187 float a = 0.01;`. */
export const LENS_FLARE_SPIRAL_AMPLITUDE = 0.01;

/** Matches `lensflare.frag.glsl:188 float dt = 3.0 * 3.14159 / N_SAMPLES;`. */
export const LENS_FLARE_SPIRAL_STEP_RADIANS =
  (3.0 * Math.PI) / LENS_FLARE_OCCLUSION_SAMPLES;

/**
 * Gaia `config.yaml:608 strength: 1.0`. Atlas mirrors 1:1. The shader's
 * compile-time `STRENGTH` constant (0.35 when useLensDirt is defined,
 * from `lensflare.frag.glsl:89-90`) already handles the Gaia per-frame
 * intensity scaling; `u_flareIntensity` is a separate tuning knob.
 */
export const LENS_FLARE_DEFAULT_INTENSITY = 1.0;

/**
 * Default flare output scalar — ADD-blended onto the scene at the
 * composer level. Starts at 1.0 (no additional scaling). Users who
 * find the flare too strong can lower this at runtime via
 * `setFlareIntensity` — Gaia itself doesn't expose a per-frame knob,
 * this is atlas-native for UX.
 */
export const LENS_FLARE_DEFAULT_FLARE_INTENSITY = 1.0;

const fragmentShader = /* glsl */ `
  #define MAX_LIGHTS ${LENS_FLARE_MAX_LIGHTS}
  #define N_SAMPLES ${LENS_FLARE_OCCLUSION_SAMPLES}
  #define STRENGTH 0.35

  uniform vec2 u_viewport;
  uniform float u_intensity;
  uniform vec2 u_lightPositions[MAX_LIGHTS];
  uniform float u_lightIntensities[MAX_LIGHTS];
  uniform int u_nLights;
  uniform vec3 u_color;
  uniform float u_flareIntensity;
  uniform float u_starburstOffset;
  uniform sampler2D u_lensDirtTexture;
  uniform sampler2D u_lensStarburstTexture;

  // luma.glsl Rec.709 (matches /tmp/gaiasky/assets/shader/lib/luma.glsl:3-4).
  float lensFlareLuma(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  // lensflare.frag.glsl:95-98 rnd(vec2)
  float rnd2(vec2 p) {
    float f = fract(sin(dot(p, vec2(12.1234, 72.8392)) * 45123.2));
    return f;
  }

  // lensflare.frag.glsl:100-103 rnd(float)
  float rnd1(float w) {
    float f = fract(sin(w) * 1000.0);
    return f;
  }

  // lensflare.frag.glsl:105-113 regShape
  float regShape(vec2 p, int N) {
    float a = atan(p.x, p.y) + 0.2;
    float b = 6.28319 / float(N);
    return smoothstep(0.5, 0.51, cos(floor(0.5 + a / b) * b - a) * length(p.xy));
  }

  // lensflare.frag.glsl:115-137 circle
  vec3 lensFlareCircle(vec2 p, float size, float decay, vec3 color, float dist, vec2 mouse) {
    float l = length(p + mouse * (dist * 4.0)) + size / 2.0;
    float l2 = length(p + mouse * (dist * 4.0)) + size / 3.0;

    float c = max(0.01 - pow(length(p + mouse * dist), size * 1.4), 0.0) * 35.0;
    float c1 = max(0.001 - pow(l - 0.3, 1.0 / 40.0) + sin(l * 30.0), 0.0) * 9.0;
    float s = max(0.01 - pow(regShape(p * 5.0 + mouse * dist * 5.0 + 0.9, 6), 1.0), 0.0) * 9.0;

    color = 0.5 + 0.5 * sin(color);
    color = cos(vec3(0.44, 0.24, 0.2) * 8.0 + dist * 4.0) * 0.5 + 0.5;
    vec3 f = c * color;
    f += c1 * color;
    f += s * color;
    return f - 0.01;
  }

  // lensflare.frag.glsl:139-160 lens_flare (complexLensFlare branch)
  vec4 lensFlareLensFlare(vec2 uv, float intensity, vec2 light_pos) {
    vec3 circColor = u_color;
    vec3 color = vec3(0.0);

    for (int i = 0; i < 10; i++) {
      color += lensFlareCircle(
        uv,
        pow(rnd1(float(i) * 2000.0), 2.0) + 1.41,
        0.0,
        circColor + float(i),
        rnd1(float(i) * 20.0) * 3.0 + 0.2 - 0.5,
        light_pos
      );
    }

    float d = length(uv - light_pos);
    color *= smoothstep(0.0, 0.4, d);
    color = color * intensity * STRENGTH;
    return vec4(color, 1.0);
  }

  // lensflare.frag.glsl:163-165,167-169 spiral sample positions
  float lensFlareFx(float t, float a) { return a * t * cos(t); }
  float lensFlareFy(float t, float a) { return a * t * sin(t); }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (u_intensity <= 0.0) {
      outputColor = vec4(0.0, 0.0, 0.0, inputColor.a);
      return;
    }

    // lensflare.frag.glsl:176-178 — aspect-ratio corrected centered uv.
    vec2 uvCentered = uv - 0.5;
    float ar = u_viewport.x / u_viewport.y;
    uvCentered.x *= ar;

    vec4 flareColor = vec4(0.0);

    // lensflare.frag.glsl:181-202 — per-light accumulator.
    for (int light = 0; light < MAX_LIGHTS; light++) {
      if (light >= u_nLights) break;

      vec2 light_pos = u_lightPositions[light] - 0.5;
      float light_intensity_scalar = u_lightIntensities[light];

      // Occlusion luma sampling (Archimedean spiral, 6 samples).
      // **LDR clamp (T2.1-fix-α, 2026-05-04)** — \`inputBuffer\` is HDR
      // (\`HalfFloatType\` composer per PostProcessingPipeline.tsx). The
      // procedural Sun's emissive renders pixels with brightness > 1.0
      // at solar-system camera distances; without a clamp here, those
      // HDR samples drive the per-light \`perLightIntensity\` past 1.0
      // and the 10-iteration \`lensFlareCircle\` accumulator amplifies
      // beyond Gaia's behaviour, producing the "exploding halo + chromatic
      // edges + hex blob" defect users report at 5-30 AU.
      // Gaia's chain side-steps this naturally because LightGlow at
      // \`lightglow.frag.glsl:97\` writes \`saturate(effectColor + scene)\`
      // — the LDR-composited buffer that LensFlare then reads. atlas's
      // pmndrs \`BlendFunction.ADD\` LightGlow does NOT chain its output
      // back into LensFlare's \`inputBuffer\` (subagent-verified vs
      // \`postprocessing/build/postprocessing.js:1335-1365\`), so
      // LensFlare here sees the raw scene HDR. The \`clamp(..., 0, 1)\`
      // emulates the LDR-boundary that Gaia obtains via composite
      // saturation, restoring 1:1 visual parity for the LF spiral
      // occlusion sampler without changing the chain order or
      // LightGlow's HDR-throughput contract.
      float t = 0.0;
      float a = ${LENS_FLARE_SPIRAL_AMPLITUDE.toFixed(2)};
      float dt = ${LENS_FLARE_SPIRAL_STEP_RADIANS.toFixed(6)};
      float lum = 0.0;
      for (int idx = 0; idx < N_SAMPLES; idx++) {
        vec2 curr_coord = light_pos + vec2(0.5) + vec2(lensFlareFx(t, a) / ar, lensFlareFy(t, a));
        lum += lensFlareLuma(clamp(texture2D(inputBuffer, curr_coord).rgb, 0.0, 1.0));
        t += dt;
      }
      lum /= float(N_SAMPLES);

      float perLightIntensity = u_intensity * lum * light_intensity_scalar;
      if (perLightIntensity > 0.0) {
        flareColor += lensFlareLensFlare(uvCentered, perLightIntensity, light_pos);
      }
    }

    flareColor = clamp(flareColor, 0.0, 1.0);

    // Inline lens-dirt + starburst modulation. Matches
    // lensdirt.frag.glsl:18-31 applied only to the flare layer.
    // See class docstring for the pmndrs architectural rationale.
    vec2 centerVec = uv - vec2(0.5);
    float d = length(centerVec);
    float radial = d > 1e-6 ? centerVec.x / d : 0.0;
    float s1 = texture2D(
      u_lensStarburstTexture,
      vec2(mod(abs(radial - u_starburstOffset), 1.0), ${PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD.toFixed(1)})
    ).r;
    float s2 = texture2D(
      u_lensStarburstTexture,
      vec2(mod(abs(-radial + u_starburstOffset), 1.0), ${PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD.toFixed(1)})
    ).r;
    float starburst = clamp(
      s1 * s2 + (1.0 - smoothstep(0.0, 0.3, d)),
      0.0,
      1.0
    );

    vec3 dirt = texture2D(u_lensDirtTexture, uv).rgb;
    vec3 modulated = flareColor.rgb * (dirt * 3.0 + starburst);

    // Gaia lensdirt.frag.glsl:34-35 clamps the final modulated output
    // to [0, 1] BEFORE the combine filter applies its intensity
    // scalar. Atlas collapses the combine step into u_flareIntensity,
    // so the clamp must happen on modulated before multiplication —
    // otherwise HDR values exceeding 1 leak into downstream Bloom
    // via the composer ADD blend. (2026-04-22 codex audit drift fix.)
    modulated = clamp(modulated, 0.0, 1.0);

    outputColor = vec4(modulated * u_flareIntensity, inputColor.a);
  }
`;

/**
 * COMPLEX lens-flare Effect. Drivers populate the light-position
 * array per frame (typically just index 0 = Sun) before the composer
 * ticks.
 */
export class LensFlareEffect extends Effect {
  constructor(options?: {
    intensity?: number;
    flareIntensity?: number;
    starburstOffset?: number;
  }) {
    const lightPositions: THREE.Vector2[] = [];
    const lightIntensities: number[] = [];
    for (let i = 0; i < LENS_FLARE_MAX_LIGHTS; i++) {
      lightPositions.push(new THREE.Vector2(0, 0));
      lightIntensities.push(0);
    }

    const uniforms = new Map<string, THREE.Uniform>([
      ["u_viewport", new THREE.Uniform(new THREE.Vector2(1, 1))],
      [
        "u_intensity",
        new THREE.Uniform(options?.intensity ?? LENS_FLARE_DEFAULT_INTENSITY),
      ],
      ["u_lightPositions", new THREE.Uniform(lightPositions)],
      ["u_lightIntensities", new THREE.Uniform(lightIntensities)],
      ["u_nLights", new THREE.Uniform(0)],
      ["u_color", new THREE.Uniform(new THREE.Color(1, 1, 1))],
      [
        "u_flareIntensity",
        new THREE.Uniform(
          options?.flareIntensity ?? LENS_FLARE_DEFAULT_FLARE_INTENSITY
        ),
      ],
      ["u_starburstOffset", new THREE.Uniform(options?.starburstOffset ?? 0)],
      ["u_lensDirtTexture", new THREE.Uniform(getLensDirtSprite())],
      ["u_lensStarburstTexture", new THREE.Uniform(getLensStarburstSprite())],
    ]);

    super("LensFlareEffect", fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.ADD,
      uniforms,
    });
  }

  /**
   * Push a single light into slot 0. `uv` is in [0, 1] with origin at
   * bottom-left (WebGL texture convention). Matches Gaia's
   * `LensFlare.setLightPositions(1, [uv.x, uv.y], [intensity])` call
   * at `LensFlare.java:65-67` → `LensFlareFilter.setLightPositions`
   * at `LensFlareFilter.java:55-61`.
   */
  setLight(uv: readonly [number, number], intensity: number): void {
    const positions = this.uniforms.get("u_lightPositions")?.value as
      | THREE.Vector2[]
      | undefined;
    const intensities = this.uniforms.get("u_lightIntensities")?.value as
      | number[]
      | undefined;
    const nLights = this.uniforms.get("u_nLights");
    if (!positions || !intensities || !nLights) return;
    positions[0].set(uv[0], uv[1]);
    intensities[0] = intensity;
    nLights.value = 1;
  }

  /**
   * Clear all lights — shader's `u_intensity <= 0` guard
   * (`lensflare.frag.glsl:175,204-206`) takes the cheap early-out
   * path and emits `vec4(0)`. Drivers call this when the Sun is
   * off-screen or fully occluded, matching Gaia
   * `LensFlare.setIntensity(0)` at `MainPostProcessor.java:671`.
   */
  clearLights(): void {
    const nLights = this.uniforms.get("u_nLights");
    if (nLights) nLights.value = 0;
  }

  setIntensity(intensity: number): void {
    const u = this.uniforms.get("u_intensity");
    if (u) u.value = intensity;
  }

  setFlareIntensity(intensity: number): void {
    const u = this.uniforms.get("u_flareIntensity");
    if (u) u.value = intensity;
  }

  setStarburstOffset(offset: number): void {
    const u = this.uniforms.get("u_starburstOffset");
    if (u) u.value = offset;
  }

  setViewportSize(width: number, height: number): void {
    const u = this.uniforms.get("u_viewport");
    if (u) (u.value as THREE.Vector2).set(width, height);
  }
}
