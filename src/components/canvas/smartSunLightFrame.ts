import * as THREE from "three";

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
