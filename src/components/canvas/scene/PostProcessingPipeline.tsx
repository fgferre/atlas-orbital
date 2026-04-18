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
    //      `vfxHdrGain`-lifted starfield fragments and the sun
    //      MeshBasicMaterial (surfaces on §1.3's HDR-emissive allow-
    //      list). That's why Bloom is first and tone mapping comes
    //      AFTER it.
    //   2. HueSaturation + BrightnessContrast's `saturation`, `contrast`,
    //      `brightness` values in `config/visualPresets.ts` (0.29 /
    //      0.42 / 0) were tuned for a post-tone-map LDR buffer —
    //      applying them in HDR space washes highlights and crushes
    //      shadows. Commit 2 shipped with those effects BEFORE tone
    //      mapping and the result was the "cores esmaecidas + sol
    //      negro" regression (Codex P1.3). Moving ToneMapping
    //      between Bloom and the grades restores LDR semantics for the
    //      user-facing knobs.
    //
    // Deviates from tasks/prompt-wave-alpha.md's literal "tone mapping
    // runs LAST". The correctness intent from R1 #1A §1.1 was "bloom
    // in HDR"; grade order is aesthetic and production-standard
    // pipelines place grading after tone mapping for exactly this
    // reason. Documented in the Wave α P1-fix commit.
    //
    // Selective bloom: `luminanceThreshold` + `luminanceSmoothing`
    // keep only HDR-emissive allow-list surfaces in the bloom target.
    //
    // Threshold calibration (Wave α UX pass): the prompt's R1 #2
    // called for `luminanceThreshold=1.0`, which in theory is exact
    // for the HDR-emissive contract. In practice the Bloom pass
    // downsamples through a 6-level mipmap pyramid, averaging each
    // bright pixel with its neighbors at every level. Starfield
    // sprites are 5–50 px wide HDR over a black sky, so the mipmap
    // averaging dilutes their peak luminance below 1.0 after the
    // first couple of downsamples → bright stars crossed the per-
    // pixel threshold but the pyramid levels where bloom pulls
    // from saw sub-threshold averages → no visible halo. Dropping
    // to 0.85 keeps the selective behavior (planet surfaces / orbit
    // lines / overlay HTML still can't bloom — they're ≤ 1.0 by
    // contract and the 0.85 floor is comfortably above their
    // typical peak) while catching the downsampled bright-star
    // pixels. `luminanceSmoothing=0.1` kills magnitude-stable flicker.
    return (
      <EffectComposer>
        {bloomEnabled ? (
          <Bloom
            ref={assignBloomRef}
            mipmapBlur
            luminanceThreshold={0.85}
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
