import { useEffect, useRef, type RefObject } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  VISUAL_PRESETS,
  getPresetForContext,
} from "../../../config/visualPresets";
import { BODIES_BY_ID } from "../../../data/celestialBodies";
import { resolveHeliocentricDistanceAU } from "../../../lib/orbital";
import { simulationClock } from "../../../lib/simulationClock";
import { useStore } from "../../../store";
import type {
  BloomController,
  HueSaturationController,
  BrightnessContrastController,
} from "./PostProcessingPipeline";
import {
  resolveLerpRefTargets,
  type GraphicsOverrides,
} from "./visualPresetOverrides";

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
  bloomIntensityMultiplier: number;
  /**
   * Per-field user overrides resolved from
   * `graphicsSlice.graphicsOverrides`. DisplayPanel sliders are the
   * canonical user surface; see `resolveLerpRefTargets` for how the
   * empty-record identity is preserved.
   */
  userOverrides?: GraphicsOverrides;
}

export const useVisualPresetLerp = ({
  bloomRef,
  hueSatRef,
  brightnessRef,
  ambientLightRef,
  sunLightRef,
  smartSunLightRef,
  controlsRef,
  bloomIntensityMultiplier,
  userOverrides,
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
        // True heliocentric distance in AU. Using `orbit.a` here was
        // wrong for any body with a parentId (Europa's `orbit.a` is
        // 0.0045 AU to Jupiter, not ~5.2 AU to the Sun), which made the
        // preset classifier misroute satellites — 22 bodies in the
        // current dataset. The composer walks parentId up to the Sun,
        // staying in physical AU regardless of didactic remapping (L18
        // applies — imperative read inside useFrame, no React subscribe).
        const distanceFromSun = focusedBody.orbit
          ? resolveHeliocentricDistanceAU(focusId, simulationClock.getNow())
          : 0;
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

    // Resolve the target values for every ref through the pure helper.
    // With `userOverrides = {}`, this is byte-identical to the
    // pre-Wave-α per-field math (pinned by
    // `visualPresetOverrides.test.ts`). The hook owns the imperative
    // ref mutation; the decision of *what* to write lives in the pure
    // module.
    const targets = resolveLerpRefTargets(
      currentValues.current,
      userOverrides ?? {},
      bloomIntensityMultiplier
    );

    if (bloomRef.current) {
      bloomRef.current.intensity = targets.bloomIntensity;
      bloomRef.current.luminanceThreshold = targets.bloomThreshold;
      // Radius is tricky with mipmapBlur, often static. We'll skip radius lerping for now or assume it works.
    }
    if (hueSatRef.current) hueSatRef.current.saturation = targets.saturation;
    if (brightnessRef.current) {
      brightnessRef.current.brightness = targets.brightness;
      brightnessRef.current.contrast = targets.contrast;
    }
    if (ambientLightRef.current)
      ambientLightRef.current.intensity = targets.ambientIntensity;
    if (sunLightRef.current)
      sunLightRef.current.intensity = targets.sunIntensity;
    if (smartSunLightRef.current)
      smartSunLightRef.current.intensity = targets.shadowIntensity;

    // Environment Intensity
    // scene.environmentIntensity is available in newer Three.js versions (r163+)
    // We keep the mutable scene handle in a ref so the React hooks lint rule
    // doesn't treat this imperative Three.js update as a render-time mutation.
    sceneRef.current.environmentIntensity = targets.envMapIntensity;
  });
};
