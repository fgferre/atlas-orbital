import {
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { useStore } from "../../store";

/**
 * Smart directional light that follows the focused celestial body.
 * Intensity is controlled by visual presets in Scene.tsx via ref.
 * Future: Will implement 1/r² falloff based on distance from Sun.
 */

export const resolveSmartSunLightFrame = ({
  targetPosition,
  shadowExtent,
  minimumShadowExtent = 1e-3,
  minimumLightDistance = 10,
  frustumMargin = 1.35,
  distanceMultiplier = 2.5,
}: {
  targetPosition: THREE.Vector3;
  shadowExtent: number;
  minimumShadowExtent?: number;
  minimumLightDistance?: number;
  frustumMargin?: number;
  distanceMultiplier?: number;
}) => {
  const sunDirection =
    targetPosition.lengthSq() > 1e-12
      ? targetPosition.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
  const shadowRadius =
    Math.max(minimumShadowExtent, shadowExtent) * frustumMargin;
  const lightDistance = Math.max(
    minimumLightDistance,
    shadowRadius * distanceMultiplier
  );

  return {
    lightPosition: targetPosition
      .clone()
      .sub(sunDirection.clone().multiplyScalar(lightDistance)),
    shadowBounds: {
      left: -shadowRadius,
      right: shadowRadius,
      top: shadowRadius,
      bottom: -shadowRadius,
      near: 0.1,
      far: lightDistance + shadowRadius * 2.5,
    },
  };
};

export const SmartSunLight = forwardRef<
  THREE.DirectionalLight,
  { intensity?: number; shadowMapSize?: number }
>(({ intensity = 1.5, shadowMapSize = 4096 }, ref) => {
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const datetime = useStore((state) => state.datetime);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const shadowCameraRef = useRef<THREE.OrthographicCamera>(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);

  useImperativeHandle(ref, () => lightRef.current!);

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = lightTarget;
    }
  }, [lightTarget]);

  useFrame(({ scene }) => {
    if (!lightRef.current || !shadowCameraRef.current) return;

    // 1. Identify Target
    const trackedBodyId = !focusId || focusId === "sun" ? "earth" : focusId;
    const trackedBody =
      SOLAR_SYSTEM_BODIES.find((body) => body.id === trackedBodyId) ?? null;
    let targetObj = scene.getObjectByName(trackedBodyId);

    if (!targetObj || !trackedBody) return;

    // 2. Calculate Positions
    const targetPos = new THREE.Vector3();
    targetObj.getWorldPosition(targetPos);
    const shadowExtent = AstroPhysics.resolveShadowExtent({
      body: trackedBody,
      bodies: SOLAR_SYSTEM_BODIES,
      date: datetime,
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
