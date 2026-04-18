import { useEffect, type RefObject } from "react";
import { useControls, folder, button } from "leva";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  VISUAL_PRESETS,
  type VisualPresetType,
} from "../../../config/visualPresets";

interface UseSceneDebugControlsArgs {
  visualPreset: VisualPresetType;
  debugMode: boolean;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}

export const useSceneDebugControls = ({
  visualPreset,
  debugMode,
  controlsRef,
}: UseSceneDebugControlsArgs) => {
  // Debug Controls - Refactored to use function API to get 'set'
  const [values, set] = useControls(() => ({
    Lighting: folder({
      ambientIntensity: {
        value: VISUAL_PRESETS.DEEP_SPACE.ambientIntensity,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Ambient Light",
      },
      sunIntensity: {
        value: VISUAL_PRESETS.DEEP_SPACE.sunIntensity,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Sun Brightness (Point)",
      },
      shadowIntensity: {
        value: VISUAL_PRESETS.DEEP_SPACE.shadowIntensity,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Shadow Light (Dir)",
      },
      envMapIntensity: {
        value: VISUAL_PRESETS.DEEP_SPACE.envMapIntensity,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Reflections (IBL)",
      },
    }),
    "Post Processing": folder({
      bloomThreshold: {
        value: VISUAL_PRESETS.DEEP_SPACE.bloomThreshold,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Bloom Threshold",
      },
      bloomIntensity: {
        value: VISUAL_PRESETS.DEEP_SPACE.bloomIntensity,
        min: 0,
        max: 3,
        step: 0.1,
        label: "Bloom Intensity",
      },
      bloomRadius: {
        value: VISUAL_PRESETS.DEEP_SPACE.bloomRadius,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Bloom Radius",
      },
      saturation: {
        value: VISUAL_PRESETS.DEEP_SPACE.saturation,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Saturation",
      },
      contrast: {
        value: VISUAL_PRESETS.DEEP_SPACE.contrast,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Contrast",
      },
      brightness: {
        value: VISUAL_PRESETS.DEEP_SPACE.brightness,
        min: -1,
        max: 1,
        step: 0.01,
        label: "Brightness",
      },
    }),
    "Planet Material": folder({
      roughness: { value: 0.7, min: 0, max: 1, step: 0.1, label: "Roughness" },
      metalness: {
        value: 0.3,
        min: 0,
        max: 1,
        step: 0.1,
        label: "Metalness",
      },
      sunEmissive: {
        value: 2.7,
        min: 0,
        max: 10,
        step: 0.1,
        label: "Sun Emissive Power",
      },
      ringEmissive: {
        value: 0.2,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Ring Emissive Power",
      },
    }),
    Shadows: folder({
      ringShadowIntensity: {
        value: 0.34,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Ring Shadow Opacity",
      },
    }),
    Calibration: folder({
      earthRotationOffset: {
        value: 0,
        min: 0,
        max: 360,
        step: 1,
        label: "Earth Rotation Offset",
      },
      nightLightIntensity: {
        value: 0.2,
        min: 0,
        max: 10,
        step: 0.1,
        label: "Night Light Intensity",
      },
    }),
    Tools: folder({
      "Copy Settings": button((get) => {
        const settings = {
          // Lighting
          ambientIntensity: get("Lighting.ambientIntensity"),
          sunIntensity: get("Lighting.sunIntensity"),
          shadowIntensity: get("Lighting.shadowIntensity"),
          envMapIntensity: get("Lighting.envMapIntensity"),

          // Post Processing
          bloomThreshold: get("Post Processing.bloomThreshold"),
          bloomIntensity: get("Post Processing.bloomIntensity"),
          bloomRadius: get("Post Processing.bloomRadius"),
          saturation: get("Post Processing.saturation"),
          contrast: get("Post Processing.contrast"),
          brightness: get("Post Processing.brightness"),

          // Planet Material
          roughness: get("Planet Material.roughness"),
          metalness: get("Planet Material.metalness"),
          sunEmissive: get("Planet Material.sunEmissive"),
          ringEmissive: get("Planet Material.ringEmissive"),

          // Shadows
          ringShadowIntensity: get("Shadows.ringShadowIntensity"),

          // Calibration
          earthRotationOffset: get("Calibration.earthRotationOffset"),
          nightLightIntensity: get("Calibration.nightLightIntensity"),
        };

        const json = JSON.stringify(settings, null, 2);
        navigator.clipboard
          .writeText(json)
          .then(() => {
            console.info("[debug] Settings copied to clipboard");
          })
          .catch((err) => {
            console.error("[debug] Failed to copy settings:", err);
          });
      }),
    }),
    Camera: folder(
      {
        "Copy Camera Position": button(() => {
          const cam = controlsRef.current?.object;
          if (cam) {
            const pos = `new THREE.Vector3(${cam.position.x.toFixed(0)}, ${cam.position.y.toFixed(0)}, ${cam.position.z.toFixed(0)})`;
            navigator.clipboard.writeText(pos).then(() => {
              console.info("[debug] Camera position copied:", pos);
            });
          } else {
            console.warn("[debug] Camera not available");
          }
        }),
        "Log Camera Info": button(() => {
          const cam = controlsRef.current?.object;
          const target = controlsRef.current?.target;
          if (cam && target) {
            console.log("=== Camera Debug ===");
            console.log(
              `Position: new THREE.Vector3(${cam.position.x.toFixed(0)}, ${cam.position.y.toFixed(0)}, ${cam.position.z.toFixed(0)})`
            );
            console.log(
              `Target: new THREE.Vector3(${target.x.toFixed(0)}, ${target.y.toFixed(0)}, ${target.z.toFixed(0)})`
            );
            console.log(`Distance: ${cam.position.length().toFixed(0)} units`);
          }
        }),
      },
      { collapsed: true }
    ),
  }));

  // Sync Leva controls with current preset when entering debug mode
  useEffect(() => {
    if (debugMode) {
      const currentPreset = VISUAL_PRESETS[visualPreset];
      set({
        ambientIntensity: currentPreset.ambientIntensity,
        sunIntensity: currentPreset.sunIntensity,
        shadowIntensity: currentPreset.shadowIntensity,
        envMapIntensity: currentPreset.envMapIntensity,
        bloomThreshold: currentPreset.bloomThreshold,
        bloomIntensity: currentPreset.bloomIntensity,
        bloomRadius: currentPreset.bloomRadius,
        saturation: currentPreset.saturation,
        contrast: currentPreset.contrast,
        brightness: currentPreset.brightness,
      });
    }
  }, [debugMode, visualPreset, set]);

  return values;
};
