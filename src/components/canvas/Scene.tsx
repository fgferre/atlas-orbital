import { Canvas } from "@react-three/fiber";
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

export const Scene = () => {
  return (
    <>
      <Canvas
        camera={{
          position: [0, 3000, 4000],
          fov: 40,
          near: 0.01,
          far: 1e14, // Increased to ensure visibility of distant stars
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={["#000000"]} />
        <Starfield />

        <ambientLight intensity={0.1} />
        <pointLight position={[0, 0, 0]} intensity={2} decay={0} />

        <SolarSystem />
        <OverlayPositionTracker />
        <CameraController />
        <OrbitControls
          enablePan={true}
          maxDistance={1e13} // Increased to allow zooming out to see the whole starfield
          minDistance={0.00001}
          zoomSpeed={3.0} // Faster zoom for better navigation at large scales
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
      </Canvas>
      <PlanetOverlay />
    </>
  );
};
