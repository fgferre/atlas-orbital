import * as THREE from "three";

export interface SmartSunLightFrame {
  lightPosition: THREE.Vector3;
  shadowBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    near: number;
    far: number;
  };
}

interface ResolveSmartSunLightFrameOptions {
  targetPosition: THREE.Vector3;
  shadowExtent: number;
  minimumShadowExtent?: number;
  minimumLightDistance?: number;
  frustumMargin?: number;
  distanceMultiplier?: number;
}

/**
 * Zero-allocation hot-path variant. The caller owns `output` and can reuse it
 * for every animation frame.
 */
export const updateSmartSunLightFrame = (
  targetPosition: THREE.Vector3,
  shadowExtent: number,
  output: SmartSunLightFrame,
  minimumShadowExtent = 1e-3,
  minimumLightDistance = 10,
  frustumMargin = 1.35,
  distanceMultiplier = 2.5
): SmartSunLightFrame => {
  const shadowRadius =
    Math.max(minimumShadowExtent, shadowExtent) * frustumMargin;
  const lightDistance = Math.max(
    minimumLightDistance,
    shadowRadius * distanceMultiplier
  );
  const targetLengthSq = targetPosition.lengthSq();

  output.lightPosition.copy(targetPosition);
  if (targetLengthSq > 1e-12) {
    output.lightPosition.addScaledVector(
      targetPosition,
      -lightDistance / Math.sqrt(targetLengthSq)
    );
  } else {
    output.lightPosition.z -= lightDistance;
  }

  output.shadowBounds.left = -shadowRadius;
  output.shadowBounds.right = shadowRadius;
  output.shadowBounds.top = shadowRadius;
  output.shadowBounds.bottom = -shadowRadius;
  output.shadowBounds.near = 0.1;
  output.shadowBounds.far = lightDistance + shadowRadius * 2.5;

  return output;
};

export const resolveSmartSunLightFrame = ({
  targetPosition,
  shadowExtent,
  minimumShadowExtent = 1e-3,
  minimumLightDistance = 10,
  frustumMargin = 1.35,
  distanceMultiplier = 2.5,
}: ResolveSmartSunLightFrameOptions): SmartSunLightFrame =>
  updateSmartSunLightFrame(
    targetPosition,
    shadowExtent,
    {
      lightPosition: new THREE.Vector3(),
      shadowBounds: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        near: 0,
        far: 0,
      },
    },
    minimumShadowExtent,
    minimumLightDistance,
    frustumMargin,
    distanceMultiplier
  );
