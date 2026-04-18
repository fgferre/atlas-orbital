import { useEffect, useRef, type RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  VISUAL_PRESETS,
  getPresetForContext,
} from "../../../config/visualPresets";
import { BODIES_BY_ID } from "../../../data/celestialBodies";
import { useStore } from "../../../store";
import type {
  BloomController,
  HueSaturationController,
  BrightnessContrastController,
} from "./PostProcessingPipeline";

export interface DebugValues {
  ambientIntensity: number;
  sunIntensity: number;
  shadowIntensity: number;
  envMapIntensity: number;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomRadius: number;
  saturation: number;
  contrast: number;
  brightness: number;
}

type SceneWithEnvironmentIntensity = THREE.Scene & {
  environmentIntensity?: number;
};

interface UseVisualPresetLerpArgs {
  bloomRef: RefObject<BloomController | null>;
  hueSatRef: RefObject<HueSaturationController | null>;
  brightnessRef: RefObject<BrightnessContrastController | null>;
  ambientLightRef: RefObject<THREE.AmbientLight | null>;
  sunLightRef: RefObject<THREE.PointLight | null>;
  smartSunLightRef: RefObject<THREE.DirectionalLight | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  debugValues: DebugValues;
  debugMode: boolean;
  bloomIntensityMultiplier: number;
}

export const useVisualPresetLerp = ({
  bloomRef,
  hueSatRef,
  brightnessRef,
  ambientLightRef,
  sunLightRef,
  smartSunLightRef,
  controlsRef,
  debugValues,
  debugMode,
  bloomIntensityMultiplier,
}: UseVisualPresetLerpArgs) => {
  const scene = useThree((s) => s.scene);
  const visualPreset = useStore((state) => state.visualPreset);
  const setVisualPreset = useStore((state) => state.setVisualPreset);
  const autoPresetEnabled = useStore((state) => state.autoPresetEnabled);
  const focusId = useStore((state) => state.focusId);

  const currentValues = useRef({ ...VISUAL_PRESETS[visualPreset] });
  const sceneRef = useRef<SceneWithEnvironmentIntensity>(
    scene as SceneWithEnvironmentIntensity
  );

  useEffect(() => {
    sceneRef.current = scene as SceneWithEnvironmentIntensity;
  }, [scene]);

  useFrame(() => {
    // 1. Auto-select preset
    if (autoPresetEnabled && focusId) {
      const focusedBody = BODIES_BY_ID.get(focusId);
      if (focusedBody) {
        // Default to 0 if orbit is missing (e.g. Sun)
        const distanceFromSun = focusedBody.orbit ? focusedBody.orbit.a : 0;
        // Approximate camera distance using OrbitControls distance if available, else placeholder
        const cameraDistance = controlsRef.current?.getDistance() ?? 1000;

        const newPreset = getPresetForContext(distanceFromSun, cameraDistance);
        if (newPreset !== visualPreset) {
          setVisualPreset(newPreset);
        }
      }
    }

    // 2. Lerp values
    const targetPreset = VISUAL_PRESETS[visualPreset];
    const lerpFactor = 0.05;

    (
      Object.keys(currentValues.current) as Array<keyof typeof targetPreset>
    ).forEach((key) => {
      currentValues.current[key] = THREE.MathUtils.lerp(
        currentValues.current[key],
        targetPreset[key],
        lerpFactor
      );
    });

    // Apply to Refs
    if (bloomRef.current) {
      bloomRef.current.intensity = debugMode
        ? debugValues.bloomIntensity
        : currentValues.current.bloomIntensity * bloomIntensityMultiplier;
      bloomRef.current.luminanceThreshold = debugMode
        ? debugValues.bloomThreshold
        : currentValues.current.bloomThreshold;
      // Radius is tricky with mipmapBlur, often static. We'll skip radius lerping for now or assume it works.
    }
    if (hueSatRef.current)
      hueSatRef.current.saturation = debugMode
        ? debugValues.saturation
        : currentValues.current.saturation;
    if (brightnessRef.current) {
      brightnessRef.current.brightness = debugMode
        ? debugValues.brightness
        : currentValues.current.brightness;
      brightnessRef.current.contrast = debugMode
        ? debugValues.contrast
        : currentValues.current.contrast;
    }
    if (ambientLightRef.current)
      ambientLightRef.current.intensity = debugMode
        ? debugValues.ambientIntensity
        : currentValues.current.ambientIntensity;
    if (sunLightRef.current)
      sunLightRef.current.intensity = debugMode
        ? debugValues.sunIntensity
        : currentValues.current.sunIntensity;
    if (smartSunLightRef.current)
      smartSunLightRef.current.intensity = debugMode
        ? debugValues.shadowIntensity
        : currentValues.current.shadowIntensity;

    // Environment Intensity
    // scene.environmentIntensity is available in newer Three.js versions (r163+)
    // We keep the mutable scene handle in a ref so the React hooks lint rule
    // doesn't treat this imperative Three.js update as a render-time mutation.
    sceneRef.current.environmentIntensity = debugMode
      ? debugValues.envMapIntensity
      : currentValues.current.envMapIntensity;
  });
};
