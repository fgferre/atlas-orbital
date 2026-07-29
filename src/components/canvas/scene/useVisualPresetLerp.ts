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
  // Heliocentric distance is stable on the classifier's scale — the
  // thresholds are in AU and no body drifts more than ~1e-6 AU per
  // wall-clock second. Caching per (focusId, 1 s bucket) turns the
  // useFrame call from `1 compose + 3 allocations per tick` into
  // `~1 compose per second + scalar compare`. Cache invalidates when
  // the user focuses a different body or enough sim time passes.
  const distanceCacheRef = useRef<{
    focusId: string | null;
    bucket: number;
    value: number;
  }>({ focusId: null, bucket: -1, value: 0 });

  useEffect(() => {
    sceneRef.current = scene as SceneWithEnvironmentIntensity;
  }, [scene]);

  useFrame(() => {
    // 1. Auto-select preset
    if (autoPresetEnabled && focusId) {
      const focusedBody = BODIES_BY_ID.get(focusId);
      if (focusedBody) {
        let distanceFromSun: number;
        if (!focusedBody.orbit) {
          // Sun (no orbit).
          distanceFromSun = 0;
        } else {
          const bucket = Math.floor(Date.now() / 1000);
          const cache = distanceCacheRef.current;
          if (cache.focusId === focusId && cache.bucket === bucket) {
            distanceFromSun = cache.value;
          } else {
            // True heliocentric distance in AU. Using `orbit.a` here
            // was wrong for any body with a parentId (Europa's
            // `orbit.a` is 0.0045 AU to Jupiter, not ~5.2 AU to the
            // Sun), which misrouted satellite classification for all
            // 22 satellites in the dataset. The composer walks
            // parentId up to the Sun in physical AU, independent of
            // didactic render-space remapping. L18 literal —
            // imperative read inside useFrame, no React subscribe.
            distanceFromSun = resolveHeliocentricDistanceAU(
              focusId,
              simulationClock.getNow()
            );
            cache.focusId = focusId;
            cache.bucket = bucket;
            cache.value = distanceFromSun;
          }
        }
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
    // pre-Wave-α per-field math EXCEPT `ambientIntensity`, which now
    // composes the Onda 1.3 display floor on top of the preset's
    // invariant 0.0 (pinned by `visualPresetOverrides.test.ts`). The
    // hook owns the imperative ref mutation; the decision of *what* to
    // write lives in the pure module.
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
