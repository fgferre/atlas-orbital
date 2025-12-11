import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, memo } from "react";
import { OrbitControls, Environment } from "@react-three/drei";
import { Starfield } from "./Starfield";
import { NASAStarfield } from "./NASAStarfield";
import {
  EffectComposer,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  ToneMapping,
} from "@react-three/postprocessing";
import * as THREE from "three";
import {
  VISUAL_PRESETS,
  getPresetForContext,
} from "../../config/visualPresets";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { SolarSystem } from "./SolarSystem";
import { CameraController } from "./CameraController";
import { InitialCameraAnimation } from "./InitialCameraAnimation";
import { OverlayPositionTracker } from "./OverlayPositionTracker";
import { PlanetOverlay } from "./PlanetOverlay";
import { SceneReadyChecker } from "./SceneReadyChecker";

import { useStore } from "../../store";

import { SmartSunLight } from "./SmartSunLight";

import { useControls, Leva, folder, button } from "leva";

const SceneContent = ({
  bloomRef,
  hueSatRef,
  brightnessRef,
  ambientLightRef,
  sunLightRef,
  smartSunLightRef,
  controlsRef,
  debugValues,
  debugMode,
}: any) => {
  const { scene } = useThree();
  const visualPreset = useStore((state) => state.visualPreset);
  const setVisualPreset = useStore((state) => state.setVisualPreset);
  const autoPresetEnabled = useStore((state) => state.autoPresetEnabled);
  const focusId = useStore((state) => state.focusId);

  const currentValues = useRef({ ...VISUAL_PRESETS[visualPreset] });

  useFrame(() => {
    // 1. Auto-select preset
    if (autoPresetEnabled && focusId) {
      const focusedBody = SOLAR_SYSTEM_BODIES.find((b) => b.id === focusId);
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
        : currentValues.current.bloomIntensity;
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
    // We assign it unconditionally (casting to any) to ensure it's updated if supported.
    (scene as any).environmentIntensity = debugMode
      ? debugValues.envMapIntensity
      : currentValues.current.envMapIntensity;
  });

  return null;
};

const PostProcessingEffects = memo(
  ({ bloomRef, hueSatRef, brightnessRef }: any) => {
    return (
      <EffectComposer>
        <Bloom
          ref={bloomRef}
          mipmapBlur
          // radius={bloomRadius} // Removed to prevent serialization issues
        />
        <ToneMapping />
        <HueSaturation ref={hueSatRef} hue={0} />
        <BrightnessContrast ref={brightnessRef} />
      </EffectComposer>
    );
  }
);

/**
 * Dynamic zoom speed based on camera distance.
 * Close to planets: slow zoom for precision
 * Far away: fast zoom to cover astronomical distances
 */
const DynamicZoom = ({
  controlsRef,
}: {
  controlsRef: React.RefObject<any>;
}) => {
  const { camera } = useThree();

  useFrame(() => {
    if (!controlsRef.current) return;

    // Get distance from origin (where solar system is centered)
    const distance = camera.position.length();

    // Logarithmic zoom speed: increases as you get farther
    // At 1000 units (roughly Saturn): zoomSpeed ~2
    // At 1,000,000 units: zoomSpeed ~6
    // At 1,000,000,000 units: zoomSpeed ~10
    const logDistance = Math.log10(Math.max(distance, 100));
    const zoomSpeed = Math.max(1, logDistance - 1);

    controlsRef.current.zoomSpeed = zoomSpeed;
  });

  return null;
};

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);
  const visualPreset = useStore((state) => state.visualPreset); // Get current preset
  const debugMode = useStore((state) => state.debugMode);
  const toggleDebugMode = useStore((state) => state.toggleDebugMode);
  const useNASAStarfield = useStore((state) => state.useNASAStarfield);

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
            alert("Settings copied to clipboard!");
          })
          .catch((err) => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy settings. Check console.");
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
              console.log("Camera position copied:", pos);
              alert(`Copied: ${pos}`);
            });
          } else {
            alert("Camera not available");
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

  const {
    ambientIntensity,
    sunIntensity,
    shadowIntensity,
    envMapIntensity,
    bloomThreshold,
    bloomIntensity,
    bloomRadius,
    saturation,
    contrast,
    brightness,
    roughness,
    metalness,
    sunEmissive,
    ringEmissive,
    ringShadowIntensity,
    earthRotationOffset,
    nightLightIntensity,
  } = values;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleDebugMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleDebugMode]);

  const bloomRef = useRef<any>(null);
  const hueSatRef = useRef<any>(null);
  const brightnessRef = useRef<any>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const sunLightRef = useRef<THREE.PointLight>(null);
  const smartSunLightRef = useRef<THREE.DirectionalLight>(null);
  const controlsRef = useRef<any>(null);

  const debugValues = {
    ambientIntensity,
    sunIntensity,
    shadowIntensity,
    envMapIntensity,
    bloomThreshold,
    bloomIntensity,
    bloomRadius,
    saturation,
    contrast,
    brightness,
  };

  return (
    <>
      <Leva theme={{ sizes: { rootWidth: "350px" } }} hidden={!debugMode} />
      <Canvas
        shadows="soft"
        onPointerMissed={() => setSelectedId(null)}
        camera={{
          position: [-95809369, 999990981402, 4245931557], // Far position for intro animation (Milky Way view)
          fov: 45,
          near: 0.1,
          far: 1e15,
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ReinhardToneMapping;
        }}
      >
        <SceneContent
          bloomRef={bloomRef}
          hueSatRef={hueSatRef}
          brightnessRef={brightnessRef}
          ambientLightRef={ambientLightRef}
          sunLightRef={sunLightRef}
          smartSunLightRef={smartSunLightRef}
          controlsRef={controlsRef}
          debugValues={debugValues}
          debugMode={debugMode}
        />
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          {useNASAStarfield ? <NASAStarfield /> : <Starfield />}
          <Environment resolution={256} frames={1} far={1e9}>
            {/* Starfield removed from Environment - was causing planet lighting issues */}
            {/* Only sun mesh for reflections */}
            <mesh position={[0, 0, 0]} scale={[100, 100, 100]}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshBasicMaterial color={[10, 10, 10]} toneMapped={false} />
            </mesh>
          </Environment>
        </Suspense>

        <ambientLight ref={ambientLightRef} />

        {/* 
          Central Sun Light (Omnidirectional) 
          - Provides lighting for the whole system
          - Does NOT cast shadows (too expensive/low res)
        */}
        <pointLight ref={sunLightRef} position={[0, 0, 0]} decay={0} />

        {/* 
          Smart Sun Light (Directional)
          - Casts high-quality shadows for the focused object
        */}
        <SmartSunLight ref={smartSunLightRef} />

        <Suspense fallback={null}>
          <SolarSystem
            roughness={roughness}
            metalness={metalness}
            sunEmissive={sunEmissive}
            ringEmissive={ringEmissive}
            ringShadowIntensity={ringShadowIntensity}
            earthRotationOffset={earthRotationOffset}
            nightLightIntensity={nightLightIntensity}
          />
        </Suspense>
        <OverlayPositionTracker />
        <CameraController />
        <InitialCameraAnimation />
        <OrbitControls
          ref={controlsRef}
          enablePan={true}
          enableDamping={true}
          dampingFactor={0.05}
          maxDistance={1e12} // Large distance for proper zoom
          minDistance={10} // Increased to prevent near-plane clipping/jitter
          zoomSpeed={2.0}
          makeDefault
        />
        <DynamicZoom controlsRef={controlsRef} />

        <PostProcessingEffects
          bloomRef={bloomRef}
          hueSatRef={hueSatRef}
          brightnessRef={brightnessRef}
        />
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
    </>
  );
};
