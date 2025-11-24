import { Canvas } from '@react-three/fiber';
import { Stars, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { SolarSystem } from './SolarSystem';
import { CameraController } from './CameraController';

export const Scene = () => {
  return (
    <Canvas camera={{ position: [0, 2000, 3000], fov: 45, far: 500000 }}>
      <color attach="background" args={['#000000']} />
      <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, 0]} intensity={2} decay={0} /> {/* Sun Light */}
      
      <SolarSystem />
      <CameraController />
      <OrbitControls enablePan={true} maxDistance={300000} minDistance={10} makeDefault />
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.9} mipmapBlur intensity={1.5} radius={0.4} />
        <ToneMapping />
      </EffectComposer>
    </Canvas>
  );
};
