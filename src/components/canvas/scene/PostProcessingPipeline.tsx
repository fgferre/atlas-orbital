import { memo, useCallback, type RefObject } from "react";
import {
  EffectComposer,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

export interface BloomController {
  intensity: number;
  luminanceThreshold: number;
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
  bloomEnabled: boolean;
}

export const PostProcessingPipeline = memo(
  ({
    bloomRef,
    hueSatRef,
    brightnessRef,
    bloomEnabled,
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

    // Effect ordering (Wave α — post fix wave-alpha P1.3):
    //   Bloom (HDR in) → ToneMapping (AgX, HDR→LDR) → HueSaturation (LDR) →
    //   BrightnessContrast (LDR)
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
    // The HDR contract stays `luminanceThreshold=1.0` (prompt R1 #2):
    // only surfaces on the HDR-emissive allow-list cross the
    // threshold — planet / atmosphere / cloud / ring / orbit-line
    // surfaces remain ≤ 1.0 by §1.3 contract. The Gaia HYG starfield
    // also remains ≤ 1.0 after the fragment saturate; its large named
    // halos are handled by the Gaia LightGlow/lens-flare waves, not by
    // selective Bloom. `luminanceSmoothing=0.1` kills stable-threshold
    // flicker.
    return (
      <EffectComposer>
        {bloomEnabled ? (
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
        <ToneMapping mode={ToneMappingMode.AGX} />
        <HueSaturation ref={assignHueSatRef} hue={0} />
        <BrightnessContrast ref={assignBrightnessRef} />
      </EffectComposer>
    );
  }
);
