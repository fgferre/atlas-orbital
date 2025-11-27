import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { KM_TO_3D_UNITS, AstroPhysics } from "../../lib/astrophysics";

export const CameraController = () => {
  const { camera, scene } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);

  const flyingRef = useRef({
    isFlying: false,
    cameraTargetPos: new THREE.Vector3(),
    flyOffset: new THREE.Vector3(),
  });

  const prevFocusRef = useRef<string | null>(null);
  const prevScaleModeRef = useRef<string | null>(null);

  // Calculate ideal camera distance based on body size
  const getTargetScale = (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
    if (scaleMode === "didactic") {
      return AstroPhysics.calculateDidacticRadius(body.radiusKm);
    } else {
      return body.radiusKm * KM_TO_3D_UNITS;
    }
  };

  // Initialize flying animation when focus changes or scale mode changes
  useEffect(() => {
    if (!focusId || !controls || !camera) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((b) => b.id === focusId);
    if (!bodyData) return;

    // Calculate target position analytically to ensure it's up-to-date with scaleMode
    // (Mesh position might be stale from previous frame during mode switch)
    const { datetime } = useStore.getState();

    // Calculate system multipliers (needed for correct position)
    const systemMultipliers =
      AstroPhysics.calculateSystemMultipliers(SOLAR_SYSTEM_BODIES);
    const multiplier = bodyData.parentId
      ? systemMultipliers[bodyData.parentId] || 1
      : 1;

    const targetPos = AstroPhysics.calculateLocalPosition(
      bodyData.orbit,
      datetime,
      scaleMode,
      multiplier
    );

    // If it's a moon, we need to add the parent's position!
    // This is a bit complex because we need to traverse up the hierarchy.
    // For now, let's handle 1 level of depth (Moon -> Planet -> Sun)
    if (bodyData.parentId) {
      const parent = SOLAR_SYSTEM_BODIES.find(
        (b) => b.id === bodyData.parentId
      );
      if (parent) {
        const parentPos = AstroPhysics.calculateLocalPosition(
          parent.orbit,
          datetime,
          scaleMode,
          1 // Planets don't have multipliers (orbiting Sun)
        );
        targetPos.add(parentPos);
      }
    }

    // Check if this is a mode switch (focusId didn't change, but scaleMode did)
    // We need a ref to track the previous focusId and scaleMode
    const isModeSwitch =
      prevFocusRef.current === focusId &&
      prevScaleModeRef.current !== scaleMode;

    // Update refs
    prevFocusRef.current = focusId;
    prevScaleModeRef.current = scaleMode;

    const targetRadius = getTargetScale(bodyData);
    const isSaturn = focusId === "saturn";
    const distMultiplier =
      scaleMode === "realistic" ? 5.0 : isSaturn ? 6.0 : 4.5;
    const idealDist = targetRadius * distMultiplier;

    // Calculate direction from target to camera
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();

    if (direction.lengthSq() < 0.1) {
      direction.set(0, 0, 1);
    }

    const newCamPos = new THREE.Vector3()
      .copy(targetPos)
      .add(direction.multiplyScalar(idealDist));

    if (isModeSwitch) {
      // INSTANT SNAP for mode switching to avoid disorienting "fly across universe" effect
      camera.position.copy(newCamPos);
      controls.target.copy(targetPos);
      flyingRef.current.isFlying = false;
    } else {
      // Smooth fly for focus changes
      flyingRef.current.flyOffset = direction.clone().multiplyScalar(idealDist);
      flyingRef.current.cameraTargetPos = newCamPos;
      flyingRef.current.isFlying = true;
      controls.target.copy(targetPos);
    }
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

    // Dynamic near plane: prevent clipping when close, but keep it safe
    // CRITICAL FIX: Use much smaller multiplier for camera.near to prevent clipping
    // In didactic mode, radii are artificially large (50 for stars, 25/10 for planets)
    // So minDistance can be very large, but near plane should stay small
    // We use 1% of minDistance (instead of 10%) and cap at 0.5 (instead of 2)
    const newNear = Math.min(0.5, Math.max(0.01, controls.minDistance * 0.01));
    camera.near = newNear;
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
