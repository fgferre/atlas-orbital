import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
import { Starfield } from "./Starfield";
import {
  EffectComposer,
  Bloom,
  ToneMapping,
} from "@react-three/postprocessing";
import { SolarSystem } from "./SolarSystem";
import { CameraController } from "./CameraController";
import { OverlayPositionTracker } from "./OverlayPositionTracker";
import { PlanetOverlay } from "./PlanetOverlay";
import { SceneReadyChecker } from "./SceneReadyChecker";

import { useStore } from "../../store";

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);

  return (
    <>
      <Canvas
        onPointerMissed={() => setSelectedId(null)}
        camera={{
          position: [0, 3000, 4000],
          fov: 40,
          near: 1, // Increased from 0.01 to 1 to improve depth precision and reduce jitter
          far: 1e13, // Slightly reduced to improve precision distribution
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          <Starfield />
        </Suspense>

        <ambientLight intensity={0.1} />
        <pointLight position={[0, 0, 0]} intensity={2} decay={0} />

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
            luminanceThreshold={0.9}
            mipmapBlur
            intensity={1.5}
            radius={0.4}
          />
          <ToneMapping />
        </EffectComposer>
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
    </>
  );
};
