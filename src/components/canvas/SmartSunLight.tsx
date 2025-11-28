import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../../store";

export const SmartSunLight = () => {
  const focusId = useStore((state) => state.focusId);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());

  useFrame(({ scene }) => {
    if (!lightRef.current) return;

    // 1. Identify Target
    // If focusId is "sun" or null, we don't really need a shadow map (Sun doesn't cast shadow on itself).
    // But if we want shadows on planets even when looking at Sun, we might need a different strategy.
    // For now, let's track the focusId. If it's "sun", maybe track Earth or the last selected planet?
    // Let's stick to tracking focusId. If focus is Sun, shadows might disappear, which is fine for now.
    let targetObj = scene.getObjectByName(focusId || "earth");

    // Fallback to Earth if target not found or is Sun (Sun doesn't need to receive shadows from this light)
    if (!targetObj || focusId === "sun") {
      targetObj = scene.getObjectByName("earth");
    }

    if (!targetObj) return;

    // 2. Calculate Positions
    const targetPos = new THREE.Vector3();
    targetObj.getWorldPosition(targetPos);

    // Direction from Sun (0,0,0) to Target
    const sunDir = targetPos.clone().normalize();

    // Position the light "behind" the target (towards the Sun)
    // Distance needs to be enough to include potential occluders (like Moon orbiting Earth).
    // Moon is ~0.384 million km from Earth. Earth radius is 6371km.
    // In our scale... let's say 100 units is safe for the inner solar system.
    const lightDist = 100;

    // We want the light to be at: TargetPos - (Direction * Distance)
    // Wait, if Sun is at 0,0,0 and Earth is at 1000,0,0.
    // Direction is 1,0,0.
    // Light should be at roughly 900,0,0 (between Sun and Earth).
    // So: LightPos = TargetPos - (SunDir * LightDist) ?
    // No, LightPos should be closer to the Sun than the Earth.
    // Vector from Sun to Earth is TargetPos.
    // Light should be at TargetPos - (TargetPos.normalized * Distance).
    // Yes.

    const lightPos = targetPos
      .clone()
      .sub(sunDir.clone().multiplyScalar(lightDist));

    lightRef.current.position.copy(lightPos);

    // Update target
    lightRef.current.target.position.copy(targetPos);
    lightRef.current.target.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={targetRef.current} />
      <directionalLight
        ref={lightRef}
        intensity={0.4}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.00005}
      >
        {/* 
          Frustum Size:
          Needs to be large enough to cover the planet and its moons.
          Earth radius = 1 unit. Moon orbit = ~60 units? 
          Actually, in our scale, Moon is much closer visually.
          Let's start with a box of 20x20 units.
        */}
        <orthographicCamera
          attach="shadow-camera"
          args={[-20, 20, 20, -20, 0.1, 500]}
        />
      </directionalLight>
    </>
  );
};
