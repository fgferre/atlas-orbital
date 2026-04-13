import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { KM_TO_3D_UNITS, AstroPhysics } from "../../lib/astrophysics";
import {
  PrivilegedPosition,
  CameraTransition,
  createFocusTrackingState,
  resetFocusTrackingState,
  resolveFocusTrackingFrame,
} from "../../lib/camera";

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
  });

  const transitionRef = useRef<CameraTransition>(new CameraTransition());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(
    camera as THREE.PerspectiveCamera
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(controls);
  const prevFocusRef = useRef<string | null>(null);
  const prevScaleModeRef = useRef<string | null>(null);
  const focusTrackingRef = useRef(createFocusTrackingState());

  useEffect(() => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    controlsRef.current = controls;
  }, [camera, controls]);

  useEffect(() => {
    resetFocusTrackingState(focusTrackingRef.current);
  }, [focusId]);

  const getBodyRadius = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      const baseRadius =
        scaleMode === "didactic"
          ? AstroPhysics.calculateDidacticRadius(body.radiusKm)
          : body.radiusKm * KM_TO_3D_UNITS;

      const shapeMultiplier = Math.max(...(body.shapeScale ?? [1, 1, 1]));
      const modelScale = body.model?.scale ?? 1;
      return baseRadius * shapeMultiplier * modelScale;
    },
    [scaleMode]
  );

  const getFocusMargin = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      const fidelity = body.visualProvenance?.fidelity;

      if (body.type === "moon" && fidelity === "interpretive") {
        return 3.6;
      }

      if (fidelity === "interpretive") {
        return 2.2;
      }

      if (fidelity === "observational-model") {
        return 1.95;
      }

      return 1.6;
    },
    []
  );

  const getEffectiveBoundingSphere = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      const baseRadius = getBodyRadius(body);
      return body.ringSystem
        ? baseRadius * body.ringSystem.outerRadius
        : baseRadius;
    },
    [getBodyRadius]
  );

  useEffect(() => {
    if (isIntroAnimating) return;

    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!focusId || !cameraInstance || !controlsInstance) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((body) => body.id === focusId);
    if (!bodyData) return;

    const isModeSwitch =
      prevFocusRef.current === focusId &&
      prevScaleModeRef.current !== scaleMode;

    prevFocusRef.current = focusId;
    prevScaleModeRef.current = scaleMode;

    const setupCamera = () => {
      const targetMesh = scene.getObjectByName(focusId);
      if (!targetMesh) return;

      const targetPos = new THREE.Vector3();
      targetMesh.getWorldPosition(targetPos);

      const targetRadius = getEffectiveBoundingSphere(bodyData);
      const idealDist = PrivilegedPosition.calculateIdealDistance(
        targetRadius,
        cameraInstance,
        getFocusMargin(bodyData)
      );

      const sunPosition = new THREE.Vector3(0, 0, 0);
      const parentPos = bodyData.parentId
        ? (() => {
            const parentMesh = scene.getObjectByName(bodyData.parentId!);
            if (!parentMesh) return undefined;
            const parentWorldPos = new THREE.Vector3();
            parentMesh.getWorldPosition(parentWorldPos);
            return parentWorldPos;
          })()
        : undefined;

      const direction = PrivilegedPosition.calculateContextAwareDirection(
        targetPos,
        sunPosition,
        parentPos
      );

      let newCamPos = targetPos
        .clone()
        .add(direction.clone().multiplyScalar(idealDist));

      const { isOccluded } = PrivilegedPosition.checkOcclusion(
        newCamPos,
        targetPos,
        scene,
        [focusId]
      );

      if (isOccluded) {
        newCamPos = PrivilegedPosition.findUnoccludedPosition(
          targetPos,
          newCamPos,
          scene,
          focusId
        );
      }

      const duration = isModeSwitch
        ? 800
        : Math.min(
            1500 +
              Math.min(
                cameraInstance.position.distanceTo(newCamPos) / 1000,
                2.5
              ) *
                1000,
            4000
          );

      transitionRef.current.start(
        cameraInstance.position.clone(),
        newCamPos,
        sunPosition,
        duration,
        () => {
          flyingRef.current.isFlying = false;
        }
      );

      flyingRef.current.cameraTargetPos.copy(newCamPos);
      flyingRef.current.isFlying = true;
      controlsInstance.target.copy(targetPos);
      resetFocusTrackingState(focusTrackingRef.current, targetPos);
    };

    if (isModeSwitch) {
      requestAnimationFrame(() => {
        requestAnimationFrame(setupCamera);
      });
      return;
    }

    setupCamera();
  }, [
    focusId,
    getEffectiveBoundingSphere,
    getFocusMargin,
    isIntroAnimating,
    scaleMode,
    scene,
  ]);

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

  useEffect(() => {
    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!focusId || !cameraInstance || !controlsInstance) return;

    const bodyData = SOLAR_SYSTEM_BODIES.find((body) => body.id === focusId);
    if (!bodyData) return;

    const targetRadius = getBodyRadius(bodyData);
    controlsInstance.minDistance = targetRadius * 1.1;

    const newNear = Math.max(1e-7, controlsInstance.minDistance * 0.01);
    if (Math.abs(cameraInstance.near - newNear) > 1e-8) {
      cameraInstance.near = newNear;
      cameraInstance.updateProjectionMatrix();
    }
  }, [focusId, getBodyRadius]);

  useFrame(() => {
    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!cameraInstance || !controlsInstance) return;

    if (!focusId) {
      resetFocusTrackingState(focusTrackingRef.current);
      return;
    }

    const targetMesh = scene.getObjectByName(focusId);
    if (!targetMesh) return;

    const worldPos = new THREE.Vector3();
    targetMesh.getWorldPosition(worldPos);

    const prevTarget = controlsInstance.target.clone();
    const { nextTarget, cameraDelta } = resolveFocusTrackingFrame({
      currentTarget: prevTarget,
      focusWorldPos: worldPos,
      state: focusTrackingRef.current,
    });
    controlsInstance.target.copy(nextTarget);

    if (flyingRef.current.isFlying) {
      const newPos = transitionRef.current.update();
      if (newPos) {
        cameraInstance.position.copy(newPos);
      }

      if (!transitionRef.current.active) {
        flyingRef.current.isFlying = false;
      }
      return;
    }

    cameraInstance.position.add(cameraDelta);
  });

  return null;
};
