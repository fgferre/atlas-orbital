import {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { simulationClock } from "../../lib/simulationClock";
import { useStore } from "../../store";
import { resolveSmartSunLightFrame } from "./smartSunLightFrame";

const SMART_SUN_LIGHT_LAYER = 1;

const disableSmartSunLayer = (root: THREE.Object3D) => {
  root.traverse((object) => {
    object.layers.disable(SMART_SUN_LIGHT_LAYER);
  });
};

const enableSmartSunLayerForBody = (root: THREE.Object3D, bodyId: string) => {
  root.traverse((object) => {
    object.layers.enable(SMART_SUN_LIGHT_LAYER);
  });

  // Planet groups contain their moons as nested child bodies. Keep the
  // focused body's visual subtree on the smart-shadow layer, but remove
  // nested bodies so they do not inherit the focused body's solar vector.
  root.traverse((object) => {
    if (
      object !== root &&
      object.name !== bodyId &&
      BODIES_BY_ID.has(object.name)
    ) {
      disableSmartSunLayer(object);
    }
  });
};

export const SmartSunLight = forwardRef<
  THREE.DirectionalLight,
  { intensity?: number; shadowMapSize?: number }
>(({ intensity = 0.4, shadowMapSize = 4096 }, ref) => {
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const shadowCameraRef = useRef<THREE.OrthographicCamera>(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  const targetPosRef = useRef(new THREE.Vector3());
  const layeredTargetRef = useRef<THREE.Object3D | null>(null);

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

  useEffect(() => {
    return () => {
      if (layeredTargetRef.current) {
        disableSmartSunLayer(layeredTargetRef.current);
      }
      layeredTargetRef.current = null;
    };
  }, []);

  useFrame(({ scene }) => {
    if (!lightRef.current || !shadowCameraRef.current) return;

    // 1. Identify Target
    const trackedBodyId = !focusId || focusId === "sun" ? "earth" : focusId;
    const trackedBody = BODIES_BY_ID.get(trackedBodyId) ?? null;
    const targetObj = scene.getObjectByName(trackedBodyId);

    if (!targetObj || !trackedBody) {
      if (layeredTargetRef.current) {
        disableSmartSunLayer(layeredTargetRef.current);
      }
      layeredTargetRef.current = null;
      return;
    }

    if (layeredTargetRef.current !== targetObj) {
      if (layeredTargetRef.current) {
        disableSmartSunLayer(layeredTargetRef.current);
      }
      layeredTargetRef.current = targetObj;
    }
    enableSmartSunLayerForBody(targetObj, trackedBodyId);

    // 2. Calculate Positions
    const targetPos = targetPosRef.current;
    targetObj.getWorldPosition(targetPos);
    const shadowExtent = AstroPhysics.resolveShadowExtent({
      body: trackedBody,
      bodies: SOLAR_SYSTEM_BODIES,
      date: simulationClock.getNow(),
      scaleMode,
    });
    const frame = resolveSmartSunLightFrame({
      targetPosition: targetPos,
      shadowExtent,
    });

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
