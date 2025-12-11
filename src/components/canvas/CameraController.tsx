import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { KM_TO_3D_UNITS, AstroPhysics } from "../../lib/astrophysics";
import { PrivilegedPosition, CameraTransition } from "../../lib/camera";

export const CameraController = () => {
  const { camera, scene } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const isIntroAnimating = useStore((state) => state.isIntroAnimating);

  const flyingRef = useRef({
    isFlying: false,
    cameraTargetPos: new THREE.Vector3(),
    flyOffset: new THREE.Vector3(),
  });

  // Bezier curve transition for smooth camera movement
  const transitionRef = useRef<CameraTransition>(new CameraTransition());

  const prevFocusRef = useRef<string | null>(null);
  const prevScaleModeRef = useRef<string | null>(null);

  // Calculate visual radius considering ring systems and other features
  const getEffectiveBoundingSphere = (
    body: (typeof SOLAR_SYSTEM_BODIES)[0]
  ) => {
    const baseRadius =
      scaleMode === "didactic"
        ? AstroPhysics.calculateDidacticRadius(body.radiusKm)
        : body.radiusKm * KM_TO_3D_UNITS;

    // For planets with rings (Saturn, Uranus), use outer ring radius
    if (body.ringSystem) {
      return baseRadius * body.ringSystem.outerRadius;
    }

    return baseRadius;
  };

  // Get actual body radius (without rings) for collision/clipping calculations
  const getBodyRadius = (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
    return scaleMode === "didactic"
      ? AstroPhysics.calculateDidacticRadius(body.radiusKm)
      : body.radiusKm * KM_TO_3D_UNITS;
  };

  // Initialize flying animation when focus changes or scale mode changes
  useEffect(() => {
    // Skip normal camera setup during intro animation
    if (isIntroAnimating) return;
    if (!focusId || !controls || !camera) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((b) => b.id === focusId);
    if (!bodyData) return;

    // Check if this is a mode switch (focusId didn't change, but scaleMode did)
    const isModeSwitch =
      prevFocusRef.current === focusId &&
      prevScaleModeRef.current !== scaleMode;

    // Update refs immediately
    prevFocusRef.current = focusId;
    prevScaleModeRef.current = scaleMode;

    // Main camera setup function
    const setupCamera = () => {
      const targetMesh = scene.getObjectByName(focusId);
      if (!targetMesh) {
        return; // Mesh not yet available
      }

      const targetPos = new THREE.Vector3();
      targetMesh.getWorldPosition(targetPos);

      // Use effective bounding sphere (includes rings for Saturn/Uranus)
      const targetRadius = getEffectiveBoundingSphere(bodyData);

      // Calculate ideal distance considering both vertical and horizontal FOV (aspect ratio)
      const cam = camera as THREE.PerspectiveCamera;
      const fovVertRad = THREE.MathUtils.degToRad(cam.fov);
      const distVertical = targetRadius / Math.sin(fovVertRad / 2);

      // Check horizontal FOV for ultrawide screens (21:9, etc.)
      const fovHorizRad = 2 * Math.atan(Math.tan(fovVertRad / 2) * cam.aspect);
      const distHorizontal = targetRadius / Math.sin(fovHorizRad / 2);

      // Use larger distance to ensure object fits in both dimensions
      const distBase = Math.max(distVertical, distHorizontal);

      // Add 60% breathing room margin (less aggressive zoom)
      const idealDist = distBase * 1.6;

      // Calculate camera direction using solar alignment (Rembrandt lighting)
      const sunPosition = new THREE.Vector3(0, 0, 0);
      const direction = PrivilegedPosition.calculateSolarAlignedDirection(
        targetPos,
        sunPosition
      );

      // Calculate final camera position
      let newCamPos = targetPos
        .clone()
        .add(direction.clone().multiplyScalar(idealDist));

      // Check for occlusion (e.g., Io behind Jupiter)
      // Only check against planet/moon meshes, not orbit lines
      const { isOccluded } = PrivilegedPosition.checkOcclusion(
        newCamPos,
        targetPos,
        scene,
        [focusId] // Exclude the target itself
      );

      if (isOccluded) {
        newCamPos = PrivilegedPosition.findUnoccludedPosition(
          targetPos,
          newCamPos,
          scene,
          focusId
        );
      }

      // Start camera transition
      const duration = isModeSwitch
        ? 800
        : Math.min(
            1500 +
              Math.min(camera.position.distanceTo(newCamPos) / 1000, 2.5) *
                1000,
            4000
          );

      transitionRef.current.start(
        camera.position.clone(),
        newCamPos,
        sunPosition,
        duration,
        () => {
          flyingRef.current.isFlying = false;
        }
      );
      flyingRef.current.cameraTargetPos = newCamPos;
      flyingRef.current.isFlying = true;
      controls.target.copy(targetPos);
    };

    // For mode switches, wait 2 frames for mesh positions to update
    if (isModeSwitch) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setupCamera();
        });
      });
    } else {
      setupCamera();
    }
  }, [focusId, scaleMode, controls, camera, scene, isIntroAnimating]);

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

    const targetRadius = getBodyRadius(bodyData);

    // Dynamic minDistance: allow getting closer to smaller objects
    // Allow zooming in until we are almost touching the surface (1.1x radius)
    controls.minDistance = targetRadius * 1.1;

    // Dynamic near plane: prevent clipping when close
    // Set near plane to be a fraction of the minDistance (e.g., 1/100th)
    // This ensures we never clip the object even at closest zoom
    // We clamp it to a very small value (1e-7) to support tiny objects in realistic mode
    const newNear = Math.max(1e-7, controls.minDistance * 0.01);

    // Only update if significantly different to avoid thrashing
    if (Math.abs(camera.near - newNear) > 1e-8) {
      camera.near = newNear;
      camera.updateProjectionMatrix();
    }
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

    // Flying animation using Bezier curve with easing
    if (flyingRef.current.isFlying) {
      const newPos = transitionRef.current.update();

      if (newPos) {
        camera.position.copy(newPos);
      }

      // Check if transition completed
      if (!transitionRef.current.active) {
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
