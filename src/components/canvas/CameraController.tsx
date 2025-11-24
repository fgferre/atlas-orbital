import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export const CameraController = () => {
  const { controls } = useThree();
  const { focusId } = useStore();
  
  useFrame((state) => {
      if (!focusId || !controls) return;
      
      const obj = state.scene.getObjectByName(focusId);
      if (obj) {
          const targetPos = new THREE.Vector3();
          obj.getWorldPosition(targetPos);
          
          const ctrl = controls as unknown as OrbitControlsImpl;
          // Smoothly interpolate target to the object's position
          ctrl.target.lerp(targetPos, 0.1);
          ctrl.update();
      }
  });

  return null;
};
