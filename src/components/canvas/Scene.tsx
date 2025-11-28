import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
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

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);

  return (
    <>
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
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          <Starfield />
        </Suspense>

        <ambientLight intensity={0.12} />

        {/* 
          Central Sun Light (Omnidirectional) 
          - Provides lighting for the whole system
          - Does NOT cast shadows (too expensive/low res)
        */}
        <pointLight
          position={[0, 0, 0]}
          intensity={0.18} // Radial illumination from Sun center
          decay={0}
        />

        {/* 
          Smart Sun Light (Directional)
          - Casts high-quality shadows for the focused object
        */}
        <SmartSunLight />

        <Suspense fallback={null}>
          <SolarSystem />
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
            luminanceThreshold={0.65}
            mipmapBlur
            intensity={1.5}
            radius={0.4}
          />
          <ToneMapping />
          <HueSaturation saturation={0.4} hue={0} />
          <BrightnessContrast brightness={0.0} contrast={0.35} />
        </EffectComposer>
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
    </>
  );
};
