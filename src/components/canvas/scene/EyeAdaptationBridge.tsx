import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { ToneMappingEffect } from "postprocessing";
import { setSceneExposure } from "../../../lib/graphics/exposureRegistry";
import {
  EYE_ADAPTATION_CEILING,
  exposureFromAdaptedLuminance,
  isLuminanceSampleDue,
  stepExposureTowards,
  unpackLuminanceFromRGBA8,
} from "../../../lib/graphics/eyeAdaptation";

/**
 * 1d — eye-adaptation. Reads the composer's own adaptive-luminance
 * downsample and writes a bounded exposure scalar into the
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
 *   1. Force-enables its internal `adaptiveLuminancePass` (bypassing the
 *      mode-gated auto-toggle above). `EffectPass` already calls
 *      `effect.update(renderer, inputBuffer, deltaTime)` unconditionally
 *      each frame — once `enabled` is true that call runs the SAME
 *      downsample-to-1×1-mip + temporal-smoothing GPU passes the library
 *      uses for Reinhard2-adaptive, sampling the SAME `inputBuffer` (the
 *      composer's real HDR scene buffer, post LightGlow/LensFlare) —
 *      genuinely "downsamples scene luminance to a 1×1 mip", not an
 *      invented approximation. The flag is re-asserted every frame
 *      because the `mode` setter would clear it on a Display-panel
 *      operator change; it is a plain boolean write, not GPU work.
 *   2. Reads that 1×1 texture back to the CPU — **asynchronously and at
 *      ~4 Hz**, see the perf note below — and unpacks it: the pass
 *      stores the value via three.js's standard
 *      `packDepthToRGBA`/`unpackRGBAToDepth` RGBA8 encoding
 *      (`adaptive-luminance.frag`, index.js:13019-13028; matches
 *      `three/src/renderers/shaders/ShaderChunk/packing.glsl.js`), which
 *      is why `unpackLuminanceFromRGBA8` reimplements that exact dot
 *      product rather than reading a plain grayscale byte.
 *   3. Converts luminance → exposure and eases toward it every frame via
 *      `setSceneExposure()`.
 *
 * `adaptiveLuminancePass` and its `renderTargetAdapted` render target
 * are real runtime properties (`this.adaptiveLuminancePass = new
 * AdaptiveLuminancePass(...)` at index.js:13368; `this.renderTargetAdapted
 * = this.renderTargetPrevious.clone()` at index.js:13215) that the
 * package's hand-written `.d.ts` omits — only `adaptiveLuminanceMaterial`
 * and `texture` getters are typed. The readback needs the actual
 * `WebGLRenderTarget` (checked via `renderTarget.isWebGLRenderTarget`
 * in `three/src/renderers/WebGLRenderer.js`), and a bare `Texture` has no
 * public back-reference to the target that owns it, so reaching the
 * undeclared field via a narrow local type is the only way to read this
 * value without re-implementing the pass's render-target bookkeeping.
 * The `AdaptiveLuminanceInternals` cast below is scoped to exactly the
 * two fields this file uses.
 *
 * ## Readback cost (perf regression fixed 2026-07-28)
 *
 * The first cut of this bridge called the SYNCHRONOUS
 * `gl.readRenderTargetPixels` every frame. That is a blocking
 * `glReadPixels`: the driver must finish every queued GL command before
 * it can answer, which destroys CPU/GPU overlap and turns frame time
 * into `cpu + gpu` instead of `max(cpu, gpu)` — a user-visible "the app
 * got heavy" on real hardware, invisible in headless SwiftShader where
 * the tier resolves to `constrained` and none of this mounts.
 *
 * Two changes, both in `lib/graphics/eyeAdaptation.ts`:
 *   • `readRenderTargetPixelsAsync` (three r165+, fence + PIXEL_PACK_BUFFER)
 *     replaces the blocking call, so the render loop never waits.
 *   • The read is throttled to `EYE_ADAPTATION_SAMPLE_INTERVAL_MS`
 *     (~4 Hz) with an in-flight guard, and the exposure scalar is eased
 *     toward each sample per frame on the CPU so the coarser grid cannot
 *     read as a staircase.
 *
 * The GPU-side luminance chain deliberately keeps running every frame:
 * its temporal integration IS the adaptation curve (tau ≈ 1 s), it costs
 * a 256×256 quad plus two 1×1 quads, and throttling it would change the
 * look rather than just the sampling of it.
 *
 * ## Bounding the adaptation (why a black frame cannot reach exposure=16)
 *
 * `minLuminance={STAR_DISPLAY_BLACK_POINT}` is passed to `<ToneMapping>`
 * so the SAME constant the starfield shader math calibrates the display
 * black point against also floors the GPU-side adaptive sample
 * (`l0=max(minLuminance,l0); l1=max(minLuminance,l1)` in the library's
 * own shader). `exposureFromAdaptedLuminance` reuses that identical
 * constant as BOTH the floor and the target numerator — see its JSDoc
 * for why the result is bounded to `[TARGET, 1.0]` by construction.
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

export const EyeAdaptationBridge = ({
  toneMappingRef,
}: EyeAdaptationBridgeProps) => {
  const glFromHook = useThree((state) => state.gl);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    glRef.current = glFromHook;
  }, [glFromHook]);

  // Reused across samples — avoids an allocation per readback.
  const pixelBufferRef = useRef(new Uint8Array(4));
  // True while an async readback is in flight; overlapping reads would
  // race on the shared buffer above.
  const readPendingRef = useRef(false);
  const lastSampleMsRef = useRef(Number.NEGATIVE_INFINITY);
  // Last sampled exposure, and the live value easing toward it.
  const targetExposureRef = useRef(EYE_ADAPTATION_CEILING);
  const currentExposureRef = useRef(EYE_ADAPTATION_CEILING);

  useFrame((_, delta) => {
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

    // Keep the library's adaptive-luminance passes running even though
    // the visible curve stays AGX (mode !== REINHARD2_ADAPTIVE) — see
    // the module doc comment for why this is the correct, empirically-
    // verified wiring rather than switching tone-mapping modes.
    pass.enabled = true;

    // --- sample: throttled, non-blocking -----------------------------
    const nowMs = performance.now();
    if (
      !readPendingRef.current &&
      isLuminanceSampleDue(nowMs, lastSampleMsRef.current)
    ) {
      lastSampleMsRef.current = nowMs;
      readPendingRef.current = true;
      const buffer = pixelBufferRef.current;
      void gl
        .readRenderTargetPixelsAsync(
          pass.renderTargetAdapted,
          0,
          0,
          1,
          1,
          buffer
        )
        .then(() => {
          targetExposureRef.current = exposureFromAdaptedLuminance(
            unpackLuminanceFromRGBA8(buffer)
          );
        })
        // A lost context or a disposed target rejects here. Holding the
        // previous target is the honest fallback: the scene keeps the
        // exposure it last measured instead of snapping to a guess.
        .catch(() => {})
        .finally(() => {
          readPendingRef.current = false;
        });
    }

    // --- ease toward the sample: per frame, zero GPU work ------------
    const next = stepExposureTowards(
      currentExposureRef.current,
      targetExposureRef.current,
      delta
    );
    if (next !== currentExposureRef.current) {
      currentExposureRef.current = next;
      setSceneExposure(next);
    }
  });

  return null;
};
