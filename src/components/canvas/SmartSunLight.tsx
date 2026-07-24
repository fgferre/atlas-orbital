import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { simulationClock } from "../../lib/simulationClock";
import { useStore } from "../../store";
import {
  type SmartSunLightFrame,
  updateSmartSunLightFrame,
} from "./smartSunLightFrame";
import {
  bindSmartSunLayer,
  SMART_SUN_LIGHT_LAYER,
} from "./smartSunLightLayers";

export const SmartSunLight = forwardRef<
  THREE.DirectionalLight,
  { intensity?: number; shadowMapSize?: number }
>(({ intensity = 0.4, shadowMapSize = 4096 }, ref) => {
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const scene = useThree((state) => state.scene);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const shadowCameraRef = useRef<THREE.OrthographicCamera>(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const targetPosRef = useRef(new THREE.Vector3());
  const targetObjectRef = useRef<THREE.Object3D | null>(null);
  const releaseLayerBindingRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<SmartSunLightFrame>({
    lightPosition: new THREE.Vector3(),
    shadowBounds: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      near: 0,
      far: 0,
    },
  });
  const trackedBodyId = !focusId || focusId === "sun" ? "earth" : focusId;
  const trackedBody = BODIES_BY_ID.get(trackedBodyId) ?? null;
  const shadowExtent = useMemo(
    () =>
      trackedBody
        ? AstroPhysics.resolveShadowExtent({
            body: trackedBody,
            bodies: SOLAR_SYSTEM_BODIES,
            // The current implementation derives conservative orbital bounds,
            // not an instantaneous child position; the date is retained for
            // the API contract but the result is stable for body + scale mode.
            date: simulationClock.getNow(),
            scaleMode,
          })
        : null,
    [scaleMode, trackedBody]
  );

  useImperativeHandle(ref, () => lightRef.current!);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = lightTarget;
      // Keep the shadow helper from acting as a second global sun.
      // Focused objects opt into this layer below; all other objects
      // stay on layer 0 and are lit only by the central PointLight.
      lightRef.current.layers.set(SMART_SUN_LIGHT_LAYER);
    }
  }, [lightTarget]);

  const releaseTrackedTarget = useCallback(() => {
    releaseLayerBindingRef.current?.();
    releaseLayerBindingRef.current = null;
    targetObjectRef.current = null;
  }, []);

  const bindTrackedTarget = useCallback(
    (target: THREE.Object3D | null) => {
      if (targetObjectRef.current === target) {
        return;
      }

      releaseTrackedTarget();
      if (target) {
        targetObjectRef.current = target;
        releaseLayerBindingRef.current = bindSmartSunLayer(
          target,
          trackedBodyId
        );
      }
    },
    [releaseTrackedTarget, trackedBodyId]
  );

  useEffect(() => {
    bindTrackedTarget(
      trackedBody ? (scene.getObjectByName(trackedBodyId) ?? null) : null
    );
    return releaseTrackedTarget;
  }, [
    bindTrackedTarget,
    releaseTrackedTarget,
    scene,
    trackedBody,
    trackedBodyId,
  ]);

  useFrame(() => {
    if (!lightRef.current || !shadowCameraRef.current) return;
    if (shadowExtent === null) return;

    // The effect resolves this once per focus change. The fallback lookup only
    // runs while the R3F object is not mounted (or was replaced), never during
    // the steady-state frame loop.
    let targetObj = targetObjectRef.current;
    if (!targetObj || targetObj.parent === null) {
      targetObj = scene.getObjectByName(trackedBodyId) ?? null;
      bindTrackedTarget(targetObj);
    }

    if (!targetObj) {
      return;
    }

    const targetPos = targetPosRef.current;
    targetObj.getWorldPosition(targetPos);
    const frame = updateSmartSunLightFrame(
      targetPos,
      shadowExtent,
      frameRef.current
    );

    lightRef.current.position.copy(frame.lightPosition);

    // Update target
    lightTarget.position.copy(targetPos);
    lightTarget.updateMatrixWorld();

    const shadowCamera = shadowCameraRef.current;
    const { left, right, top, bottom, near, far } = frame.shadowBounds;

    if (
      shadowCamera.left !== left ||
      shadowCamera.right !== right ||
      shadowCamera.top !== top ||
      shadowCamera.bottom !== bottom ||
      shadowCamera.near !== near ||
      shadowCamera.far !== far
    ) {
      shadowCamera.left = left;
      shadowCamera.right = right;
      shadowCamera.top = top;
      shadowCamera.bottom = bottom;
      shadowCamera.near = near;
      shadowCamera.far = far;
      shadowCamera.updateProjectionMatrix();
    }
  });

  return (
    <>
      <primitive object={lightTarget} />
      <directionalLight
        ref={lightRef}
        intensity={intensity}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
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
          ref={shadowCameraRef}
          attach="shadow-camera"
          args={[-20, 20, 20, -20, 0.1, 500]}
        />
      </directionalLight>
    </>
  );
});
