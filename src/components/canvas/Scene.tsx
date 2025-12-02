import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { OrbitControls, Environment } from "@react-three/drei";
import { Starfield } from "./Starfield";
import {
  EffectComposer,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  ToneMapping,
} from "@react-three/postprocessing";
import { SolarSystem } from "./SolarSystem";
import { CameraController } from "./CameraController";
import { OverlayPositionTracker } from "./OverlayPositionTracker";
import { PlanetOverlay } from "./PlanetOverlay";
import { SceneReadyChecker } from "./SceneReadyChecker";

import { useStore } from "../../store";

import { SmartSunLight } from "./SmartSunLight";

import { useControls, Leva, folder } from "leva";

const SceneContent = ({ envMapIntensity }: { envMapIntensity: number }) => {
  const { scene } = useThree();

  useEffect(() => {
    // scene.environmentIntensity is available in newer Three.js versions (r163+)
    if ("environmentIntensity" in scene) {
      (scene as any).environmentIntensity = envMapIntensity;
    }
  }, [envMapIntensity, scene]);

  return null;
};

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);

  // Debug Controls
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
  } = useControls({
    Lighting: folder({
      ambientIntensity: {
        value: 0.18,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Ambient Light",
      },
      sunIntensity: {
        value: 1.1,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Sun Brightness (Point)",
      },
      shadowIntensity: {
        value: 2.5,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Shadow Light (Dir)",
      },
      envMapIntensity: {
        value: 1.8,
        min: 0,
        max: 5,
        step: 0.1,
        label: "Reflections (IBL)",
      },
    }),
    "Post Processing": folder({
      bloomThreshold: {
        value: 0.66,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Bloom Threshold",
      },
      bloomIntensity: {
        value: 0.1,
        min: 0,
        max: 3,
        step: 0.1,
        label: "Bloom Intensity",
      },
      bloomRadius: {
        value: 0.63,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Bloom Radius",
      },
      saturation: {
        value: 0.15,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Saturation",
      },
      contrast: { value: 0.5, min: 0, max: 1, step: 0.01, label: "Contrast" },
      brightness: {
        value: -0.1,
        min: -1,
        max: 1,
        step: 0.01,
        label: "Brightness",
      },
    }),
    "Planet Material": folder({
      roughness: { value: 0.7, min: 0, max: 1, step: 0.1, label: "Roughness" },
      metalness: {
        value: 0.2,
        min: 0,
        max: 1,
        step: 0.1,
        label: "Metalness",
      },
      sunEmissive: {
        value: 2.1,
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
        value: 0.45,
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
        value: 0.4,
        min: 0,
        max: 10,
        step: 0.1,
        label: "Night Light Intensity",
      },
    }),
  });

  const debugMode = useStore((state) => state.debugMode);
  const toggleDebugMode = useStore((state) => state.toggleDebugMode);

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

  return (
    <>
      <Leva theme={{ sizes: { rootWidth: "350px" } }} hidden={!debugMode} />
      <Canvas
        shadows="soft"
        onPointerMissed={() => setSelectedId(null)}
        camera={{
          position: [0, 3000, 4000],
          fov: 40,
          near: 1,
          far: 1e13,
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <SceneContent envMapIntensity={envMapIntensity} />
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          <Starfield />
          <Environment resolution={256} frames={1} far={1e9}>
            <Starfield />
            {/* Sun Representation for Reflections */}
            <mesh position={[0, 0, 0]} scale={[100, 100, 100]}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshBasicMaterial color={[10, 10, 10]} toneMapped={false} />
            </mesh>
          </Environment>
        </Suspense>

        <ambientLight intensity={ambientIntensity} />

        {/* 
          Central Sun Light (Omnidirectional) 
          - Provides lighting for the whole system
          - Does NOT cast shadows (too expensive/low res)
        */}
        <pointLight
          position={[0, 0, 0]}
          intensity={sunIntensity} // Radial illumination from Sun center
          decay={0}
        />

        {/* 
          Smart Sun Light (Directional)
          - Casts high-quality shadows for the focused object
        */}
        <SmartSunLight intensity={shadowIntensity} />

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
        <OrbitControls
          enablePan={true}
          maxDistance={1e12} // Reduced to prevent extreme zoom-out jitter
          minDistance={10} // Increased to prevent near-plane clipping/jitter
          zoomSpeed={2.0}
          makeDefault
        />

        <EffectComposer>
          <Bloom
            luminanceThreshold={bloomThreshold}
            mipmapBlur
            intensity={bloomIntensity}
            radius={bloomRadius}
          />
          <ToneMapping />
          <HueSaturation saturation={saturation} hue={0} />
          <BrightnessContrast brightness={brightness} contrast={contrast} />
        </EffectComposer>
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
    </>
  );
};
