import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { simulationClock } from "../../lib/simulationClock";
import {
  PrivilegedPosition,
  CameraTransition,
  createFocusTrackingState,
  resetFocusTrackingState,
  resolveFocusTrackingFrame,
} from "../../lib/camera";

// Module-level scratch vectors for the focus-tracking useFrame. Safe
// because the frame loop is single-threaded and every read is paired
// synchronously with a write inside the same tick. `resolveFocusTrackingFrame`
// copies its inputs internally before use (see `lib/camera/controls.ts`),
// so passing these refs never leaks mutation back into the caller.
const TMP_WORLD_POS = new THREE.Vector3();
const TMP_PREV_TARGET = new THREE.Vector3();

export const CameraController = () => {
  const { camera, scene, size } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const isIntroAnimating = useStore((state) => state.isIntroAnimating);
  const viewportFraming = useStore((state) => state.viewportFraming);

  const flyingRef = useRef({
    isFlying: false,
    cameraTargetPos: new THREE.Vector3(),
  });

  const transitionRef = useRef<CameraTransition>(new CameraTransition());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(
    camera as THREE.PerspectiveCamera
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(controls);
  // Cached resolution of the scene graph node for the currently focused
  // body. Repopulated on focus change (via the useEffect below) instead
  // of re-traversing the scene in every `useFrame`.
  const focusMeshRef = useRef<THREE.Object3D | null>(null);
  const prevFocusRef = useRef<string | null>(null);
  const prevScaleModeRef = useRef<string | null>(null);
  const cameraFramingSignature = [
    viewportFraming.fitInsets.left,
    viewportFraming.fitInsets.right,
    viewportFraming.fitInsets.top,
    viewportFraming.fitInsets.bottom,
    Math.round(viewportFraming.compositionOffsetXPx),
    Math.round(viewportFraming.compositionOffsetYPx),
  ].join(":");
  const prevCameraFramingSignatureRef = useRef<string>(cameraFramingSignature);
  const prevViewportSizeRef = useRef({
    width: size.width,
    height: size.height,
  });
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
      return AstroPhysics.resolveSemanticBodyRadius({ body, scaleMode });
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

  const getFocusExtent = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      return AstroPhysics.resolveFocusExtent({
        body,
        bodies: SOLAR_SYSTEM_BODIES,
        date: simulationClock.getNow(),
        scaleMode,
      });
    },
    [scaleMode]
  );

  useEffect(() => {
    if (isIntroAnimating) return;

    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!focusId || !cameraInstance || !controlsInstance) return;

    const bodyData = BODIES_BY_ID.get(focusId);
    if (!bodyData) return;

    const isSameFocus = prevFocusRef.current === focusId;
    const isModeSwitch = isSameFocus && prevScaleModeRef.current !== scaleMode;
    const framingSignatureChanged =
      prevCameraFramingSignatureRef.current !== cameraFramingSignature;
    const viewportSizeChanged =
      prevViewportSizeRef.current.width !== size.width ||
      prevViewportSizeRef.current.height !== size.height;
    const isLayoutReframe =
      isSameFocus &&
      prevScaleModeRef.current === scaleMode &&
      (framingSignatureChanged || viewportSizeChanged);

    prevFocusRef.current = focusId;
    prevScaleModeRef.current = scaleMode;
    prevCameraFramingSignatureRef.current = cameraFramingSignature;
    prevViewportSizeRef.current = { width: size.width, height: size.height };

    // Wave α UX fix: skip the 520 ms privileged-position reposition
    // when the ONLY thing that changed is the camera-framing
    // signature (fit insets + composition offsets). Opening or
    // closing a side panel shifts `viewportFraming.fitInsets` —
    // which flipped this effect into `isLayoutReframe = true` and
    // snapped the camera back to the privileged angle every panel
    // interaction. That's the "anoying reset" the user reported.
    //
    // Genuine window resize (`viewportSizeChanged`) still triggers
    // the reframe, because the camera's privileged-position math
    // can legitimately need updating when the backing framebuffer
    // changes dimensions. Focus / scale-mode transitions also keep
    // going through the full reframe below.
    if (isLayoutReframe && framingSignatureChanged && !viewportSizeChanged) {
      return;
    }

    const setupCamera = () => {
      const targetMesh = scene.getObjectByName(focusId);
      if (!targetMesh) return;

      const targetPos = new THREE.Vector3();
      targetMesh.getWorldPosition(targetPos);

      const targetRadius = getFocusExtent(bodyData);
      const idealDist = PrivilegedPosition.calculateViewportAwareDistance(
        targetRadius,
        cameraInstance,
        size.width,
        size.height,
        viewportFraming.usableRect,
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

      const composedCamPos = PrivilegedPosition.applyViewportComposition({
        targetPos,
        cameraPos: newCamPos,
        camera: cameraInstance,
        viewportWidth: size.width,
        viewportHeight: size.height,
        compositionOffsetXPx: viewportFraming.compositionOffsetXPx,
        compositionOffsetYPx: viewportFraming.compositionOffsetYPx,
        targetUpVector: cameraInstance.up,
      });

      const { isOccluded: isComposedOccluded } =
        PrivilegedPosition.checkOcclusion(composedCamPos, targetPos, scene, [
          focusId,
        ]);

      if (!isComposedOccluded) {
        newCamPos = composedCamPos;
      }

      const duration = isLayoutReframe
        ? 520
        : isModeSwitch
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
    cameraFramingSignature,
    getFocusExtent,
    getFocusMargin,
    isIntroAnimating,
    scaleMode,
    scene,
    size.height,
    size.width,
    viewportFraming.compositionOffsetXPx,
    viewportFraming.compositionOffsetYPx,
    viewportFraming.usableRect,
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

    const bodyData = BODIES_BY_ID.get(focusId);
    if (!bodyData) return;

    const targetRadius = getBodyRadius(bodyData);
    controlsInstance.minDistance = targetRadius * 1.1;

    const newNear = Math.max(1e-7, controlsInstance.minDistance * 0.01);
    if (Math.abs(cameraInstance.near - newNear) > 1e-8) {
      cameraInstance.near = newNear;
      cameraInstance.updateProjectionMatrix();
    }
  }, [focusId, getBodyRadius]);

  // Re-resolve the scene graph node whenever the focus changes. The
  // mesh reference is then cached and reused in the useFrame below
  // without any per-frame scene traversal.
  useEffect(() => {
    if (!focusId) {
      focusMeshRef.current = null;
      return;
    }
    focusMeshRef.current = scene.getObjectByName(focusId) ?? null;
  }, [focusId, scene]);

  useFrame(() => {
    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!cameraInstance || !controlsInstance) return;

    if (!focusId) {
      resetFocusTrackingState(focusTrackingRef.current);
      return;
    }

    // Validate the cached mesh lazily — if a body was unmounted between
    // focus change and this frame (extremely rare, but possible during
    // HMR / hot-swap) re-resolve on the fly.
    let targetMesh = focusMeshRef.current;
    if (!targetMesh || targetMesh.parent === null) {
      targetMesh = scene.getObjectByName(focusId) ?? null;
      focusMeshRef.current = targetMesh;
    }
    if (!targetMesh) return;

    const worldPos = TMP_WORLD_POS;
    targetMesh.getWorldPosition(worldPos);

    const prevTarget = TMP_PREV_TARGET.copy(controlsInstance.target);
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
