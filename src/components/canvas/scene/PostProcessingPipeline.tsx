import { memo, useCallback, type RefObject } from "react";
import {
  EffectComposer,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  ToneMapping,
} from "@react-three/postprocessing";

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

    return (
      <EffectComposer>
        {bloomEnabled ? (
          <Bloom
            ref={assignBloomRef}
            mipmapBlur
            // radius={bloomRadius} // Removed to prevent serialization issues
          />
        ) : (
          <></>
        )}
        <ToneMapping />
        <HueSaturation ref={assignHueSatRef} hue={0} />
        <BrightnessContrast ref={assignBrightnessRef} />
      </EffectComposer>
    );
  }
);
