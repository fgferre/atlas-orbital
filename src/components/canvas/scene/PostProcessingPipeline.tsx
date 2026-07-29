import { memo, useCallback, useEffect, type RefObject } from "react";
import * as THREE from "three";
import {
  EffectComposer,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode, type ToneMappingEffect } from "postprocessing";
import { LensFlareSlot } from "./LensFlareInjector";
import { LightGlowSlot } from "./LightGlowInjector";
import type { ToneMappingName } from "../../../lib/graphics/resolver";
import { setSunlightToneMappingMounted } from "../../../lib/graphics/solarIrradiance";
import { STAR_DISPLAY_BLACK_POINT } from "../../../lib/starfieldShaderMath";

/**
 * Structural shape of the real `postprocessing` `BloomEffect` instance
 * `<Bloom ref>` forwards (verified against `node_modules/postprocessing`).
 *
 * `BloomEffect` itself has no `luminanceThreshold` property — only
 * `intensity`. The threshold lives one level down, on the `LuminanceMaterial`
 * (`luminanceMaterial.threshold`, a live GPU uniform write — see
 * `useVisualPresetLerp.ts` for why writing it every frame is safe). An
 * earlier version of this interface declared a `luminanceThreshold` field
 * that didn't exist on the real object: TypeScript's structural typing let
 * that compile silently, and the write from `useVisualPresetLerp` landed on
 * a dead own-property nothing read, making the DisplayPanel's bloom
 * threshold slider inert. Fixed 2026-07-29.
 */
export interface BloomController {
  intensity: number;
  luminanceMaterial: { threshold: number };
}

export interface HueSaturationController {
  saturation: number;
}

export interface BrightnessContrastController {
  brightness: number;
  contrast: number;
}

interface PostProcessingPipelineProps {
  bloomRef: RefObject<BloomController | null>;
  hueSatRef: RefObject<HueSaturationController | null>;
  brightnessRef: RefObject<BrightnessContrastController | null>;
  /**
   * 1d — lets `EyeAdaptationBridge` reach the mounted `ToneMappingEffect`
   * instance and drive its internal adaptive-luminance passes. `null`
   * whenever no ToneMapping pass is mounted (toneMapping="none", or the
   * constrained tier which never renders this component at all).
   */
  toneMappingRef: RefObject<ToneMappingEffect | null>;
  /**
   * True when `LightGlowSlot` (theta.3) should be mounted into the
   * composer. Backed by `GraphicsOverrides.lightGlowEnabled`
   * (`resolver.ts`), default `true` — preserves the pre-existing
   * always-on behavior. See that field's JSDoc for why this is a toggle
   * rather than a flipped default: the FPS audit that would justify
   * flipping it could not get a real-GPU measurement.
   */
  lightGlowMounted: boolean;
  /**
   * True when the Bloom effect should be mounted into the composer.
   * Computed at Scene level via `shouldMountBloom(bloomEnabled,
   * effectiveBloomIntensity)` (see `src/lib/graphics/bloomGate.ts`).
   * Renamed from `bloomEnabled` in T5.3a to reflect the composite
   * gate — it's NOT the quality-profile `bloomEnabled` flag alone,
   * it's the Gaia `MainPostProcessor.java:335` equivalent
   * `bloomEnabled && intensity > 0`.
   */
  bloomMounted: boolean;
  /** MSAA samples for the composer's internal RTs. See `ResolvedQualityProfile`. */
  composerMultisampling: number;
  toneMapping: ToneMappingName;
}

const TONE_MAPPING_MODE: Partial<Record<ToneMappingName, ToneMappingMode>> = {
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  reinhard: ToneMappingMode.REINHARD,
  cineon: ToneMappingMode.CINEON,
};

export const PostProcessingPipeline = memo(
  ({
    bloomRef,
    hueSatRef,
    brightnessRef,
    toneMappingRef,
    lightGlowMounted,
    bloomMounted,
    toneMapping,
    composerMultisampling,
  }: PostProcessingPipelineProps) => {
    const assignBloomRef = useCallback(
      (effect: BloomController | null) => {
        bloomRef.current = effect;
      },
      [bloomRef]
    );
    const assignHueSatRef = useCallback(
      (effect: HueSaturationController | null) => {
        hueSatRef.current = effect;
      },
      [hueSatRef]
    );
    const assignBrightnessRef = useCallback(
      (effect: BrightnessContrastController | null) => {
        brightnessRef.current = effect;
      },
      [brightnessRef]
    );
    const assignToneMappingRef = useCallback(
      (effect: ToneMappingEffect | null) => {
        toneMappingRef.current = effect;
      },
      [toneMappingRef]
    );

    // Effect ordering:
    //   Bloom (HDR in, Gaia default intensity 0) → optional ToneMapping →
    //   HueSaturation → BrightnessContrast
    //
    // Two correctness constraints the chain has to satisfy:
    //   1. Bloom must read REAL HDR luminance so it only picks up the
    //      sun MeshBasicMaterial and surfaces on §1.3's HDR-emissive
    //      allow-list. The HYG Gaia path intentionally clamps its star
    //      fragment like Gaia Sky; named-star halos belong to LightGlow.
    //      That's why Bloom is first and tone mapping comes AFTER it.
    //   2. HueSaturation + BrightnessContrast's `saturation`, `contrast`,
    //      `brightness` values in `config/visualPresets.ts` (per-preset,
    //      PLANET_ORBIT at 0.18 / 0.30 / 0 after the AgX recalibration;
    //      see commits 51c911d + ce66ff3) were tuned for a post-tone-
    //      map LDR buffer — applying them in HDR space washes highlights
    //      and crushes shadows. Commit 2 of the original Wave α shipped
    //      with those effects BEFORE tone mapping and the result was
    //      the "cores esmaecidas + sol negro" regression (Codex P1.3).
    //      Moving ToneMapping between Bloom and the grades restores LDR
    //      semantics for the user-facing knobs.
    //
    // Deviates from tasks/prompt-wave-alpha.md's literal "tone mapping
    // runs LAST". The correctness intent from R1 #1A §1.1 was "bloom
    // in HDR"; grade order is aesthetic and production-standard
    // pipelines place grading after tone mapping for exactly this
    // reason. Documented in the Wave α P1-fix commit.
    //
    // Selective bloom: the visible threshold + smoothing are set at
    // construction below, but note — the `useVisualPresetLerp` hook
    // overrides them every frame with the lerped values from
    // `VISUAL_PRESETS[context].bloomThreshold` (1.0) and the
    // corresponding `graphicsOverrides.bloomThreshold`. So the JSX
    // value here is really just the boot-frame seed, and the
    // authoritative runtime value lives in `config/visualPresets.ts`.
    // Kept matching the preset so the boot frame and the first lerp
    // tick don't disagree.
    //
    // Tone mapping is applied as a dedicated pass here only when the
    // selected operator ≠ "none". As of 1a the cascade-default for
    // composer tiers (ultra/high/medium) is AgX, which gives
    // highlights shape against the HalfFloat target — see
    // PRESET_DEFAULTS in src/lib/graphics/resolver.ts and the sweep
    // note at tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md §127.
    // Gaia itself still ships NONE in config.yaml; users who want byte
    // parity can pick "none" from the Display panel.
    //
    // The HDR contract stays `luminanceThreshold=1.0` (prompt R1 #2):
    // only surfaces on the HDR-emissive allow-list cross the
    // threshold — planet / atmosphere / cloud / ring / orbit-line
    // surfaces remain ≤ 1.0 by §1.3 contract. The Gaia HYG starfield
    // also remains ≤ 1.0 after the fragment saturate; its large named
    // halos are handled by the Gaia LightGlow/lens-flare waves, not by
    // selective Bloom. `luminanceSmoothing=0.1` kills stable-threshold
    // flicker.
    // θ.3 LightGlow — FIRST effect in the chain, matching Gaia Sky's
    // `MainPostProcessor.java:227` ordering (`ppb.add(lightGlow)`
    // before any Bloom / tone-map / grading pass). Reads the scene
    // HDR buffer, samples the Archimedean spiral for per-light bright-
    // pass detection, then adds a polar-masked time-animated halo
    // via `BlendFunction.ADD` (preserves downstream HDR for the
    // selective Bloom below). Reduced-motion gate is internal to the
    // slot component — when active it returns `null` and no
    // LightGlow fragment is compiled into the composer program.
    // **HDR buffer (§5.1 hard invariant — refreshed 2026-05-04).** The
    // EffectComposer MUST run on a `HalfFloatType` internal RT so the
    // selective Bloom downstream (`luminanceThreshold={1.0}` below)
    // can fire on genuinely-emissive scene pixels (Sun, bright stars
    // through the procedural emissive path) rather than only on
    // already-clipped LDR output. Original §5.1 justification cited
    // PseudoLensFlare's Chapman ghost weights — that branch was retired
    // by T2.1 (`a2c6594`, default flipped to COMPLEX per
    // `lensflare.frag.glsl:84-161 #ifdef complexLensFlare`), and
    // COMPLEX does NOT use ghost-weight bright-pass logic. Bloom is the
    // current hard consumer of the HDR-throughput invariant.
    //
    // **Note on LensFlare**: with HDR-throughput, the LensFlare's
    // spiral occlusion sampler reads HDR pixels (>1.0 from the
    // procedural Sun emissive) which previously amplified the
    // `lensFlareCircle` accumulator beyond Gaia's behavior. T2.1-fix-α
    // (2026-05-04) added an LDR clamp inside `LensFlareEffect.ts`
    // spiral sampler emulating Gaia's `lightglow.frag.glsl:97`
    // `saturate(effectColor + scene)` LDR-boundary — see comment in
    // `LensFlareEffect.ts:199-218` for the full rationale.
    // θ.4 Pseudo lens flare + lensdirt starburst. Two chained
    // effects (`PseudoLensFlareEffect` then `LensDirtEffect`) sit
    // between LightGlow and Bloom per `phase-gaia-sky.md §5.1` —
    // ghost-march reads HDR bright-pass before Bloom smears it.
    // Starburst spike drift is driven by the camera-direction
    // scalar inside `LensFlareSlot`.
    const toneMappingMode = TONE_MAPPING_MODE[toneMapping];

    // Onda 2.2 — publish "an operator is mounted" to the per-body solar
    // irradiance scalar, which caps itself at 1.0 without one (see
    // `SUNLIGHT_UNMAPPED_CEILING`: no shoulder ⇒ anything above 1.0 hard-clips
    // AND crosses Bloom's `luminanceThreshold = 1.0` contract into a halo).
    // The flag is written HERE, next to the mount decision it describes,
    // rather than recomputed at the consumer from `toneMapping` + tier — the
    // consumer would then be a second copy of this condition, free to drift.
    // The cleanup returning `false` is what covers the `constrained` tier:
    // Scene.tsx unmounts this whole component there, and the flag's initial
    // value is already `false` for the case where it never mounted at all.
    useEffect(() => {
      setSunlightToneMappingMounted(toneMappingMode !== undefined);
      return () => setSunlightToneMappingMounted(false);
    }, [toneMappingMode]);

    return (
      <EffectComposer
        frameBufferType={THREE.HalfFloatType}
        multisampling={composerMultisampling}
      >
        {lightGlowMounted ? <LightGlowSlot /> : <></>}
        <LensFlareSlot />
        {bloomMounted ? (
          <Bloom
            ref={assignBloomRef}
            mipmapBlur
            luminanceThreshold={1.0}
            luminanceSmoothing={0.1}
            // radius={bloomRadius} // Removed to prevent serialization issues
          />
        ) : (
          <></>
        )}
        {toneMappingMode !== undefined ? (
          // 1d — `minLuminance` floors the library's OWN internal
          // adaptive-luminance sample (see EyeAdaptationBridge.tsx for
          // why AGX mode never runs that pass on its own and why we
          // force it on separately). Anchored to the same
          // STAR_DISPLAY_BLACK_POINT constant the starfield shader math
          // calibrates the display black point against, so the GPU-side
          // floor and EyeAdaptationBridge's JS-side floor agree.
          <ToneMapping
            ref={assignToneMappingRef}
            mode={toneMappingMode}
            minLuminance={STAR_DISPLAY_BLACK_POINT}
          />
        ) : (
          <></>
        )}
        <HueSaturation ref={assignHueSatRef} hue={0} />
        <BrightnessContrast ref={assignBrightnessRef} />
      </EffectComposer>
    );
  }
);
