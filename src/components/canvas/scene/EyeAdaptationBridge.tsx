import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { ToneMappingEffect } from "postprocessing";
import { setSceneExposure } from "../../../lib/graphics/exposureRegistry";
import { STAR_DISPLAY_BLACK_POINT } from "../../../lib/starfieldShaderMath";

/**
 * 1d — eye-adaptation. Reads the composer's own adaptive-luminance
 * downsample every frame and writes a bounded exposure scalar into the
 * {@link setSceneExposure} registry; {@link ExposureBridge} (1c) carries
 * that number into `gl.toneMappingExposure` the same way it always has.
 *
 * ## What the library actually does (verified against
 * `node_modules/postprocessing/build/index.js@6.38.0`, not guessed)
 *
 * `postprocessing` ships a real adaptive-luminance pipeline
 * (`LuminancePass` → `AdaptiveLuminancePass`, index.js:13012-13278) with
 * exactly the exponential-decay integration the wave doc quotes:
 * `adaptedLum = l0 + (l1 - l0) * (1 - exp(-deltaTime * tau))`
 * (`adaptive-luminance.frag`, index.js:13022-13028). BUT it is wired up
 * ONLY for `ToneMappingMode.REINHARD2_ADAPTIVE`:
 *   - `ToneMappingEffect`'s `mode` setter does
 *     `adaptiveLuminancePass.enabled = value === REINHARD2_ADAPTIVE`
 *     (index.js:13416).
 *   - Its compound fragment shader picks the tone-curve branch by
 *     `#if TONE_MAPPING_MODE == 2 || 3` (Reinhard2 family, samples
 *     `luminanceBuffer`) vs `#else toneMapping(texel)` for every other
 *     mode, including AGX (index.js:13307-13315). The AGX branch never
 *     touches the luminance buffer at all.
 *   - `EffectPass.render()` calls `effect.update()` every frame
 *     regardless of mode (postprocessing's EffectPass, not
 *     `@react-three/postprocessing`), but `ToneMappingEffect.update()`
 *     only runs the luminance/adaptive passes `if
 *     (this.adaptiveLuminancePass.enabled)` — so under AGX the passes
 *     never execute and the adapted-luminance texture never updates.
 *
 * There is no `REINHARD2_ADAPTIVE`-flavoured AGX mode to opt into — the
 * wave doc's "confirm the enum mapping empirically" turned up a firm
 * "no". Swapping the resolver's `toneMapping` to `"reinhard2_adaptive"`
 * would also swap the ENTIRE visible tone curve away from AGX, which the
 * wave's hard scope (ship the AgX-only path first) rules out.
 *
 * ## The wiring this file actually uses
 *
 * `PostProcessingPipeline` mounts `<ToneMapping mode={AGX} ref={...}>` —
 * unchanged, still the AGX curve on screen. This bridge takes that same
 * `ToneMappingEffect` instance and:
 *   1. Force-enables its internal `adaptiveLuminancePass` every frame
 *      (bypassing the mode-gated auto-toggle above). `EffectPass`
 *      already calls `effect.update(renderer, inputBuffer, deltaTime)`
 *      unconditionally each frame — once `enabled` is true that call
 *      runs the SAME downsample-to-1×1-mip + temporal-smoothing GPU
 *      passes the library uses for Reinhard2-adaptive, sampling the
 *      SAME `inputBuffer` (the composer's real HDR scene buffer, post
 *      LightGlow/LensFlare) — genuinely "downsamples scene luminance to
 *      a 1×1 mip", not an invented approximation.
 *   2. Reads that 1×1 texture back to the CPU with
 *      `gl.readRenderTargetPixels` and unpacks it — the pass stores the
 *      value via three.js's standard `packDepthToRGBA`/`unpackRGBAToDepth`
 *      RGBA8 encoding (`adaptive-luminance.frag`, index.js:13019-13028;
 *      matches `three/src/renderers/shaders/ShaderChunk/packing.glsl.js`),
 *      which is why the unpack below reimplements that exact dot product
 *      rather than reading a plain grayscale byte.
 *   3. Converts luminance → exposure and writes it via
 *      `setSceneExposure()`.
 *
 * `adaptiveLuminancePass` and its `renderTargetAdapted` render target
 * are real runtime properties (`this.adaptiveLuminancePass = new
 * AdaptiveLuminancePass(...)` at index.js:13368; `this.renderTargetAdapted
 * = this.renderTargetPrevious.clone()` at index.js:13215) that the
 * package's hand-written `.d.ts` omits — only `adaptiveLuminanceMaterial`
 * and `texture` getters are typed. `readRenderTargetPixels` needs the
 * actual `WebGLRenderTarget` (checked via `renderTarget.isWebGLRenderTarget`
 * in `three/src/renderers/WebGLRenderer.js`), and a bare `Texture` has no
 * public back-reference to the target that owns it, so reaching the
 * undeclared field via a narrow local type is the only way to read this
 * value without re-implementing the pass's render-target bookkeeping.
 * The `AdaptiveLuminanceIternals` cast below is scoped to exactly the
 * two fields this file uses.
 *
 * ## Bounding the adaptation (why a black frame cannot reach exposure=16)
 *
 * `minLuminance={STAR_DISPLAY_BLACK_POINT}` is passed to `<ToneMapping>`
 * so the SAME constant the starfield shader math calibrates the display
 * black point against (`starfieldShaderMath.ts` — 0.165 linear,
 * pre-tonemap) also floors the GPU-side adaptive sample
 * (`l0=max(minLuminance,l0); l1=max(minLuminance,l1)` in the library's
 * own shader). The exposure formula below reuses that identical
 * constant as BOTH the floor and the target numerator:
 * `exposure = TARGET / max(luminance, TARGET)`. Since the per-pixel
 * luminance write is itself clamped to ≤ 1.0 (the library's luminance
 * render target is `UnsignedByteType`, so WebGL clamps any HDR fragment
 * output before it's stored), `luminance` always lands in
 * `[TARGET, 1.0]` and `exposure` always lands in `[TARGET, 1.0]` as a
 * direct consequence — no separate arbitrary clamp is needed to keep a
 * near-empty starfield frame (the overwhelming common case) at neutral
 * exposure = 1.0 (byte-identical to the pre-1d picture), and the most a
 * blown-out frame can ever be dimmed to is the display's own black
 * point — dimming further would only crush more content to black with
 * no perceptual benefit. The `Math.min`/`Math.max` below is defensive
 * (guards the very first frame or a future library change), not the
 * primary bound.
 *
 * ## Deferred to 1e (per the wave doc's explicit recommendation)
 *
 * This bridge only drives `gl.toneMappingExposure` via the existing 1c
 * `ExposureBridge`. Atmospheres' `exposureGround`/`exposureSky`,
 * the starfield's `u_exposure`, ring `emissiveIntensity`, and the
 * `toneMapped: false` Sun disk do NOT read the registry yet — that
 * per-shader subscription is explicitly out of scope until an A/B pass
 * shows the AgX-only linear scaling produces the "halo descola"
 * detachment the fable-5 audit predicted.
 */

interface EyeAdaptationBridgeProps {
  toneMappingRef: RefObject<ToneMappingEffect | null>;
}

/** See "Bounding the adaptation" above — shared floor/target/ceiling. */
const EYE_ADAPTATION_TARGET = STAR_DISPLAY_BLACK_POINT;
const EYE_ADAPTATION_CEILING = 1.0;

/**
 * Real runtime shape of `ToneMappingEffect`'s internal adaptive-luminance
 * plumbing (undeclared in the package's `.d.ts` — see the module doc
 * comment above for the verified source citations).
 */
interface AdaptiveLuminanceInternals {
  adaptiveLuminancePass: {
    enabled: boolean;
    renderTargetAdapted: THREE.WebGLRenderTarget;
  };
}

/**
 * three.js's standard depth-packing unpack
 * (`unpackRGBAToDepth`/`UnpackFactors4` in
 * `packing.glsl.js`), reimplemented for a CPU-side `Uint8Array` since
 * there is no public API to sample a shader's RGBA8-packed float from
 * JS. `UnpackDownscale = 255/256`; `PackFactors = [1, 256, 256², 256³]`.
 */
const UNPACK_FACTORS: readonly [number, number, number, number] = [
  255 / 256,
  255 / 256 / 256,
  255 / 256 / 65536,
  1 / 16777216,
];

const unpackDepthFromRGBA8 = (bytes: Uint8Array): number =>
  (bytes[0] / 255) * UNPACK_FACTORS[0] +
  (bytes[1] / 255) * UNPACK_FACTORS[1] +
  (bytes[2] / 255) * UNPACK_FACTORS[2] +
  (bytes[3] / 255) * UNPACK_FACTORS[3];

export const EyeAdaptationBridge = ({
  toneMappingRef,
}: EyeAdaptationBridgeProps) => {
  const glFromHook = useThree((state) => state.gl);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    glRef.current = glFromHook;
  }, [glFromHook]);

  // Reused every frame — avoids a per-frame allocation in the hot loop.
  const pixelBufferRef = useRef(new Uint8Array(4));

  useFrame(() => {
    const gl = glRef.current;
    const effect = toneMappingRef.current;
    // Both are null on the constrained tier (no EffectComposer, no
    // ToneMapping pass mounted there) and whenever the user picks
    // toneMapping="none" from the Display panel — self-gating, no
    // extra tier check needed.
    if (!gl || !effect) return;

    const pass = (effect as unknown as AdaptiveLuminanceInternals)
      .adaptiveLuminancePass;
    if (!pass?.renderTargetAdapted) return;

    // Force the library's adaptive-luminance passes to run even though
    // the visible curve stays AGX (mode !== REINHARD2_ADAPTIVE) — see
    // the module doc comment for why this is the correct, empirically-
    // verified wiring rather than switching tone-mapping modes.
    pass.enabled = true;

    const buffer = pixelBufferRef.current;
    gl.readRenderTargetPixels(pass.renderTargetAdapted, 0, 0, 1, 1, buffer);
    const luminance = Math.max(
      unpackDepthFromRGBA8(buffer),
      EYE_ADAPTATION_TARGET
    );
    const exposure = Math.min(
      EYE_ADAPTATION_CEILING,
      Math.max(EYE_ADAPTATION_TARGET, EYE_ADAPTATION_TARGET / luminance)
    );
    setSceneExposure(exposure);
  });

  return null;
};
