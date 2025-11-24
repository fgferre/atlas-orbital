import { Canvas } from "@react-three/fiber";
import { Stars, OrbitControls } from "@react-three/drei";
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
          near: 0.001,
          far: 500000,
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
      >
        <color attach="background" args={["#000000"]} />
        <Stars
          radius={300}
          depth={50}
          count={5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />

        <ambientLight intensity={0.1} />
        <pointLight position={[0, 0, 0]} intensity={2} decay={0} />

        <SolarSystem />
        <OverlayPositionTracker />
        <CameraController />
        <OrbitControls
          enablePan={true}
          maxDistance={300000}
          minDistance={0.00001}
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
