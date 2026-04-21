import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

import {
  getLensColorSprite,
  getLensDirtSprite,
  getLensStarburstSprite,
  LENS_COLOR_SPRITE_SIZE,
} from "./lensFlareSprites";

/**
 * Gaia Sky pseudo-lens-flare + lensdirt merged into a single pmndrs
 * Effect (θ.4).
 *
 * Ports three Gaia Sky shader pipelines:
 *
 *   1. `bias.frag.glsl` — binary white/black threshold (inline,
 *      returns `vec3(1.0)` on pass for 1:1 math with Gaia's
 *      downstream passes).
 *   2. `pseudolensflare.frag.glsl` — Chapman ghost march + halo +
 *      chromatic aberration + 1D lens-colour radial lookup.
 *   3. `lensdirt.frag.glsl` — multiplies the flare layer by
 *      `(dirt × 3 + starburst)` where `starburst` is a 1D spike
 *      profile sampled twice (product-of-two-samples), with a centre
 *      smoothstep bump.
 *
 * **Why a merged effect (not two chained Effects).** Gaia's
 * `PseudoLensFlare.java` uses an internal ping-pong buffer so the
 * lensdirt multiply applies ONLY to the processed flare layer, not
 * to the original scene. Then `combine.frag.glsl` mixes the result
 * back into the scene with a `flareIntensity = 0.15` scalar. pmndrs
 * `EffectComposer` chains are strictly linear — the "flare layer"
 * would be indistinguishable from the scene by the time a second
 * effect runs. Splitting into two effects (initial attempt) made
 * the dirt-multiply apply to every pixel in the scene, darkening
 * normal star / planet fragments globally by `(dirt × 3 + starburst)`
 * — a visible drift. Merging into one shader preserves Gaia's
 * "dirt modulates the flare, not the scene" semantic via
 * `BlendFunction.ADD` at the composer level.
 *
 * Pipeline inside `mainImage`:
 *   result ← bias'd ghost march + halo + lens colour    (flare layer)
 *   dirt  ← texture2D(lensDirt, uv)
 *   starburst ← product of two 1D lens-starburst samples
 *   modulated  ← result × (dirt × 3 + starburst)
 *   output     ← modulated × u_flareIntensity (ADD-blend onto scene)
 *
 * Skipped helpers from Gaia's Java pipeline:
 *
 *   - `blur.frag.glsl` × 35 passes — wide gaussian blur that
 *     softens ghost edges. Skipped for v1; the chromatic offsets
 *     already provide some softening. Follow-up if user feedback
 *     flags hard ghost edges.
 *   - `combine.frag.glsl` — per-source intensity/saturation mix.
 *     Replaced by `BlendFunction.ADD` with a single
 *     `u_flareIntensity` multiplier (matches Gaia's
 *     `flareIntensity × strength × 0.15` from
 *     `MainPostProcessor.java:286-287`).
 *
 * Composer slot: between `LightGlowSlot` and Bloom per
 * `phase-gaia-sky.md §5.1`. HDR HalfFloat RT is required (set in
 * `PostProcessingPipeline.tsx`) — bias threshold clips LDR.
 *
 * Source-literal defaults (verified 2026-04-21 against /tmp/gaiasky):
 *   - `u_ghosts = 8`              (config.yaml lensFlare.numGhosts)
 *   - `u_haloWidth = 0.5`         (config.yaml lensFlare.haloWidth)
 *   - `u_ghostDispersal = 0.4`    (pseudolensflare.frag.glsl:13)
 *   - `u_aberrationAmount = 3.5`  (pseudolensflare.frag.glsl:14)
 *   - `u_bias = -0.98`            (config.yaml lensFlare.bias)
 *   - `u_flareIntensity = 0.15`   (MainPostProcessor.java:286)
 *   - `u_starburstOffset` driven by camera.direction sum
 *     (`MainPostProcessor.java:911`)
 */

export const PSEUDO_LENS_FLARE_DEFAULT_GHOSTS = 8;
export const PSEUDO_LENS_FLARE_DEFAULT_HALO_WIDTH = 0.5;
export const PSEUDO_LENS_FLARE_DEFAULT_GHOST_DISPERSAL = 0.4;
export const PSEUDO_LENS_FLARE_DEFAULT_ABERRATION = 3.5;
export const PSEUDO_LENS_FLARE_DEFAULT_BIAS = -0.98;
/**
 * Flare intensity default. Gaia's `MainPostProcessor.java:286` sets
 * this to `strength × 0.15 = 0.15` at default strength. Gaia then
 * applies 35 gaussian-blur passes inside `PseudoLensFlare.render()`
 * which SOFTEN the hard halo/ghost edges by ~1-2 orders of magnitude
 * of energy spread before the combine filter.
 *
 * Atlas omits the blur passes (documented simplification — see class
 * docstring), so the raw ghost + halo layer retains its hard edges.
 * At Gaia's literal `0.15` scalar the ADD-blend produces a visible
 * magenta/cyan ring at the screen periphery (halo wraps via
 * `fract(texcoord + haloVec)`) and a strong aberration rim around
 * bright sources — neither of which appear in Gaia Sky runtime
 * because of the blur.
 *
 * Atlas default `0.03` (5× smaller) is tuned to preserve the subtle
 * character of the effect (visible ghosts + soft aberration + spike
 * starburst) without the overpowering rings that the no-blur path
 * would otherwise produce. Shipping Gaia's blur chain would allow
 * us to raise this back toward 0.15 — tracked as follow-up.
 */
export const PSEUDO_LENS_FLARE_DEFAULT_INTENSITY = 0.03;
/**
 * Gaia's literal strength scalar for reference. Applied by
 * `MainPostProcessor.java:286` as `strength × 0.15` → 0.15. Atlas
 * runs at ~20% of this after the blur-omission compensation.
 */
export const GAIA_PSEUDO_LENS_FLARE_INTENSITY_GAIA_LITERAL = 0.15;
export const PSEUDO_LENS_FLARE_DEFAULT_STARBURST_OFFSET = 0.0;

const fragmentShader = /* glsl */ `
  uniform int u_ghosts;
  uniform float u_haloWidth;
  uniform float u_ghostDispersal;
  uniform float u_aberrationAmount;
  uniform float u_bias;
  uniform float u_flareIntensity;
  uniform float u_starburstOffset;
  uniform sampler2D u_lensColorTexture;
  uniform sampler2D u_lensDirtTexture;
  uniform sampler2D u_lensStarburstTexture;

  // Bias-thresholded sample. Gaia bias.frag.glsl emits vec3(1.0) on
  // pass, vec3(0.0) on fail — binary white/black. Matching exactly
  // so downstream ghost accumulation sums the same magnitude as
  // Gaia's full pipeline (pre-pass + ghost shader).
  vec3 biasedSample(sampler2D tex, vec2 uv, float bias) {
    vec3 rgb = texture2D(tex, uv).rgb;
    float avg = (rgb.r + rgb.g + rgb.b) / 3.0;
    return (avg + bias > 0.0) ? vec3(1.0) : vec3(0.0);
  }

  // Chromatic aberration sample — direct port of textureDistorted()
  // from pseudolensflare.frag.glsl:19-26, with bias inlined.
  vec4 textureDistortedBiased(vec2 uv, vec2 direction, vec3 distortion, float bias) {
    vec3 rSample = biasedSample(inputBuffer, uv + direction * distortion.r, bias);
    vec3 gSample = biasedSample(inputBuffer, uv + direction * distortion.g, bias);
    vec3 bSample = biasedSample(inputBuffer, uv + direction * distortion.b, bias);
    return vec4(rSample.r, gSample.g, bSample.b, 1.0);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // Invert UV (pseudolensflare.frag.glsl:30) — bright sources
    // mirror to the opposite side of the frame for the ghost march.
    vec2 texcoord = vec2(1.0) - uv;
    vec2 texelSize = vec2(1.0) / resolution;

    // Ghost vector toward image centre.
    vec2 ghostVec = (vec2(0.5) - texcoord) * u_ghostDispersal;
    vec2 haloVec = normalize(ghostVec) * u_haloWidth;

    vec3 distortion = vec3(
      -texelSize.x * u_aberrationAmount,
      0.0,
      texelSize.x * u_aberrationAmount
    );

    // Accumulate ghost layer.
    vec4 result = vec4(0.0);
    for (int i = 0; i < 16; i++) {
      if (i >= u_ghosts) break;
      vec2 offset = fract(texcoord + ghostVec * float(i));

      float w = length(vec2(0.5) - offset) / length(vec2(0.5));
      w = pow(1.0 - w, 2.0);

      result += textureDistortedBiased(
        offset,
        normalize(ghostVec),
        distortion,
        u_bias
      ) * w;
    }

    // Lens-colour radial lookup (pseudolensflare.frag.glsl:48).
    float radialUv = length(vec2(0.5) - texcoord) / length(vec2(0.5));
    result *= texture2D(u_lensColorTexture, vec2(radialUv, 0.5));

    // Halo sample (pseudolensflare.frag.glsl:53-60).
    float haloWeight = length(vec2(0.5) - fract(texcoord + haloVec)) /
                       length(vec2(0.5));
    haloWeight = pow(1.0 - haloWeight, 3.0);
    result += textureDistortedBiased(
      fract(texcoord + haloVec),
      normalize(ghostVec),
      distortion,
      u_bias
    ) * haloWeight;

    // Clamp to the "too strong halo" hack (pseudolensflare.frag.glsl:61).
    result = min(vec4(0.7), result);

    // LensDirt + starburst modulation on the flare layer only.
    vec2 centerVec = uv - vec2(0.5);
    float d = length(centerVec);
    float radial = d > 1e-6 ? centerVec.x / d : 0.0;
    float s1 = texture2D(
      u_lensStarburstTexture,
      vec2(mod(abs(radial - u_starburstOffset), 1.0), 0.5)
    ).r;
    float s2 = texture2D(
      u_lensStarburstTexture,
      vec2(mod(abs(-radial + u_starburstOffset), 1.0), 0.5)
    ).r;
    float starburst = clamp(
      s1 * s2 + (1.0 - smoothstep(0.0, 0.3, d)),
      0.0,
      1.0
    );

    vec3 dirt = texture2D(u_lensDirtTexture, uv).rgb;
    vec3 modulated = result.rgb * (dirt * 3.0 + starburst);

    // ADD-blend onto scene via pmndrs composer. The flare layer is
    // typically 0 in dark regions, so the dirt×3+starburst modulation
    // does not darken the scene — only shapes the flare contribution.
    outputColor = vec4(modulated * u_flareIntensity, inputColor.a);
  }
`;

/**
 * Merged pseudo-lens-flare + lensdirt Effect. Exposes setters for
 * per-frame drivers (`setStarburstOffset` for the camera-direction
 * sum) and tunable uniforms.
 */
export class PseudoLensFlareEffect extends Effect {
  constructor(options?: {
    ghosts?: number;
    haloWidth?: number;
    ghostDispersal?: number;
    aberration?: number;
    bias?: number;
    flareIntensity?: number;
    starburstOffset?: number;
  }) {
    const uniforms = new Map<string, THREE.Uniform>([
      [
        "u_ghosts",
        new THREE.Uniform(options?.ghosts ?? PSEUDO_LENS_FLARE_DEFAULT_GHOSTS),
      ],
      [
        "u_haloWidth",
        new THREE.Uniform(
          options?.haloWidth ?? PSEUDO_LENS_FLARE_DEFAULT_HALO_WIDTH
        ),
      ],
      [
        "u_ghostDispersal",
        new THREE.Uniform(
          options?.ghostDispersal ?? PSEUDO_LENS_FLARE_DEFAULT_GHOST_DISPERSAL
        ),
      ],
      [
        "u_aberrationAmount",
        new THREE.Uniform(
          options?.aberration ?? PSEUDO_LENS_FLARE_DEFAULT_ABERRATION
        ),
      ],
      [
        "u_bias",
        new THREE.Uniform(options?.bias ?? PSEUDO_LENS_FLARE_DEFAULT_BIAS),
      ],
      [
        "u_flareIntensity",
        new THREE.Uniform(
          options?.flareIntensity ?? PSEUDO_LENS_FLARE_DEFAULT_INTENSITY
        ),
      ],
      [
        "u_starburstOffset",
        new THREE.Uniform(
          options?.starburstOffset ?? PSEUDO_LENS_FLARE_DEFAULT_STARBURST_OFFSET
        ),
      ],
      ["u_lensColorTexture", new THREE.Uniform(getLensColorSprite())],
      ["u_lensDirtTexture", new THREE.Uniform(getLensDirtSprite())],
      ["u_lensStarburstTexture", new THREE.Uniform(getLensStarburstSprite())],
    ]);

    super("PseudoLensFlareEffect", fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.ADD,
      uniforms,
    });
  }

  setGhosts(n: number): void {
    const u = this.uniforms.get("u_ghosts");
    if (u) u.value = Math.max(0, Math.min(16, Math.round(n)));
  }

  setHaloWidth(w: number): void {
    const u = this.uniforms.get("u_haloWidth");
    if (u) u.value = w;
  }

  setBias(b: number): void {
    const u = this.uniforms.get("u_bias");
    if (u) u.value = b;
  }

  setFlareIntensity(i: number): void {
    const u = this.uniforms.get("u_flareIntensity");
    if (u) u.value = i;
  }

  /** Update the starburst drift. Gaia drives from
   * `camera.direction.x + direction.y + direction.z`
   * (`MainPostProcessor.java:911`). */
  setStarburstOffset(offset: number): void {
    const u = this.uniforms.get("u_starburstOffset");
    if (u) u.value = offset;
  }
}

export { LENS_COLOR_SPRITE_SIZE };
