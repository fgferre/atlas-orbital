import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES, KM_TO_3D_UNITS } from "../../lib/astrophysics";

export const CameraController = () => {
  const { camera, scene } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const { focusId, scaleMode } = useStore();

  const flyingRef = useRef({
    isFlying: false,
    cameraTargetPos: new THREE.Vector3(),
    flyOffset: new THREE.Vector3(),
  });

  // Calculate ideal camera distance based on body size
  const getTargetScale = (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
    if (scaleMode === "didactic") {
      if (body.type === "star") return 60;
      if (body.radiusKm > 50000) return 40;
      if (body.type === "moon") return 10;
      return 20;
    } else {
      return body.radiusKm * KM_TO_3D_UNITS;
    }
  };

  // Initialize flying animation when focus changes
  useEffect(() => {
    if (!focusId || !controls || !camera) return;

    const targetMesh = scene.getObjectByName(focusId);
    if (!targetMesh) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((b) => b.id === focusId);
    if (!bodyData) return;

    const targetRadius = getTargetScale(bodyData);
    const isSaturn = focusId === "saturn";
    // Increased multipliers to ensure objects don't fill the entire screen (approx 50-60% coverage)
    const multiplier = scaleMode === "realistic" ? 5.0 : isSaturn ? 6.0 : 4.5;
    const idealDist = targetRadius * multiplier;

    // CRITICAL FIX: Use getWorldPosition for moons
    const worldPos = new THREE.Vector3();
    targetMesh.getWorldPosition(worldPos);

    // Calculate direction from target to camera
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();

    if (direction.lengthSq() < 0.1) {
      direction.set(0, 0, 1);
    }

    const newCamPos = new THREE.Vector3()
      .copy(worldPos)
      .add(direction.multiplyScalar(idealDist));

    flyingRef.current.flyOffset = direction.clone().multiplyScalar(idealDist);
    flyingRef.current.cameraTargetPos = newCamPos;
    flyingRef.current.isFlying = true;
  }, [focusId, scaleMode, controls, camera, scene]);

  // Stop flying when user manually moves camera
  useEffect(() => {
    if (!controls) return;

    const stopFlying = () => {
      flyingRef.current.isFlying = false;
    };

    controls.addEventListener("start", stopFlying);
    return () => {
      controls.removeEventListener("start", stopFlying);
    };
  }, [controls]);

  // Update camera settings based on target size
  useEffect(() => {
    if (!focusId || !controls || !camera) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((b) => b.id === focusId);
    if (!bodyData) return;

    const targetRadius = getTargetScale(bodyData);

    // Dynamic minDistance: allow getting closer to smaller objects
    // For small objects (radius < 1 unit), allow getting very close
    controls.minDistance = targetRadius * 1.2;

    // Dynamic near plane: prevent clipping when close
    // Set near plane to 1/10th of the minDistance
    camera.near = Math.min(1, controls.minDistance * 0.1);
    camera.updateProjectionMatrix();
  }, [focusId, scaleMode, controls, camera]);

  // Update camera position every frame
  useFrame(() => {
    if (!focusId || !controls) return;

    const targetMesh = scene.getObjectByName(focusId);
    if (!targetMesh) return;

    // CRITICAL FIX: Use getWorldPosition for correct moon tracking
    const worldPos = new THREE.Vector3();
    targetMesh.getWorldPosition(worldPos);

    const prevTarget = controls.target.clone();
    controls.target.copy(worldPos);

    // Flying animation
    if (flyingRef.current.isFlying && flyingRef.current.cameraTargetPos) {
      camera.position.lerp(flyingRef.current.cameraTargetPos, 0.05);

      const dist = camera.position.distanceTo(
        flyingRef.current.cameraTargetPos
      );
      const threshold = flyingRef.current.flyOffset.length() * 0.05;

      if (dist < threshold) {
        flyingRef.current.isFlying = false;
      }
    } else {
      // Follow target smoothly when not flying
      const deltaMove = new THREE.Vector3().subVectors(worldPos, prevTarget);
      camera.position.add(deltaMove);
    }
  });

  return null;
};
