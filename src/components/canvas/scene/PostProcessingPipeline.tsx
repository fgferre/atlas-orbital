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

    // Effect ordering (Wave α Commit 2, R1 #1A §1.1):
    //   Bloom → HueSaturation → BrightnessContrast → ToneMapping (AgX)
    //
    // Tone mapping MUST run last so Bloom reads real HDR luminance
    // (with the `vfxHdrGain`-lifted starfield feeding it) and the
    // color grades compose in linear space. AgX preserves highlight
    // fidelity better than ACES / Reinhard at extremes (Blender 4
    // default; `postprocessing` 6.x's own default on this composer).
    //
    // Selective bloom: `luminanceThreshold={1.0}` makes the pass only
    // pick up surfaces explicitly on the HDR-emissive allow-list
    // (§1.3 of tasks/lighting-backlog.md) — starfield fragments above
    // 1.0 after `vfxHdrGain`, and the sun MeshBasicMaterial. Planet /
    // atmosphere / cloud / ring materials all stay ≤ 1.0 by contract,
    // so they cannot bloom even at full preset intensity.
    // `luminanceSmoothing=0.1` kills magnitude-stable flicker.
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
        <HueSaturation ref={assignHueSatRef} hue={0} />
        <BrightnessContrast ref={assignBrightnessRef} />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    );
  }
);
