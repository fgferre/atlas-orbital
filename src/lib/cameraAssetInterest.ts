import * as THREE from "three";

export type CameraAssetVisibility = "hidden" | "prefetch" | "visible";

export interface CameraAssetInterest {
  visibility: CameraAssetVisibility;
  projectedRadiusPx: number;
  salience: number;
}

export interface ResolveCameraAssetInterestOptions {
  camera: THREE.PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  worldPosition: THREE.Vector3;
  worldRadius: number;
  focused?: boolean;
  prefetchMargin?: number;
}

export const HIDDEN_CAMERA_ASSET_INTEREST: CameraAssetInterest = Object.freeze({
  visibility: "hidden",
  projectedRadiusPx: 0,
  salience: 0,
});

export const CAMERA_ASSET_INTEREST_SAMPLE_MS = 120;
export const CAMERA_ASSET_INTEREST_DEMOTION_MS = 1_200;

const resolveProjectedSalience = (radiusPx: number) => {
  if (radiusPx >= 140) return 1;
  if (radiusPx >= 84) return 0.82;
  if (radiusPx >= 42) return 0.62;
  if (radiusPx >= 18) return 0.38;
  return 0.12;
};

/**
 * Classifies whether a body's bounding sphere is visible, just outside the
 * viewport (prefetch), or irrelevant to the current camera.
 *
 * LOD is driven by projected size rather than distance alone: a large distant
 * body can deserve more texels than a small nearby moon. The prefetch band is
 * deliberately screen-space based so rotating the camera can reveal a ready
 * low-resolution surface without loading every body in the scene.
 */
export const resolveCameraAssetInterest = ({
  camera,
  viewportWidth,
  viewportHeight,
  worldPosition,
  worldRadius,
  focused = false,
  prefetchMargin = 0.3,
}: ResolveCameraAssetInterestOptions): CameraAssetInterest => {
  const safeHeight = Math.max(1, viewportHeight);
  const safeWidth = Math.max(1, viewportWidth);
  const safeRadius = Math.max(0, worldRadius);
  const distance = camera.position.distanceTo(worldPosition);
  const verticalFovRadians = THREE.MathUtils.degToRad(camera.fov);
  const worldPerPixel =
    (2 * Math.max(distance, 1e-6) * Math.tan(verticalFovRadians * 0.5)) /
    safeHeight;
  const projectedRadiusPx = safeRadius / Math.max(worldPerPixel, 1e-9);
  const salience = resolveProjectedSalience(projectedRadiusPx);

  if (focused) {
    return {
      visibility: "visible",
      projectedRadiusPx,
      salience,
    };
  }

  camera.updateMatrixWorld();
  const projectionView = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projectionView);
  const sphere = new THREE.Sphere(worldPosition, safeRadius);

  if (frustum.intersectsSphere(sphere)) {
    return {
      visibility: "visible",
      projectedRadiusPx,
      salience,
    };
  }

  const cameraSpacePosition = worldPosition
    .clone()
    .applyMatrix4(camera.matrixWorldInverse);
  if (cameraSpacePosition.z >= safeRadius) {
    return HIDDEN_CAMERA_ASSET_INTEREST;
  }

  const ndc = worldPosition.clone().project(camera);
  const radiusNdcX = projectedRadiusPx / (safeWidth * 0.5);
  const radiusNdcY = projectedRadiusPx / (safeHeight * 0.5);
  const nearViewport =
    ndc.z >= -1 - prefetchMargin &&
    ndc.z <= 1 + prefetchMargin &&
    Math.abs(ndc.x) <= 1 + prefetchMargin + radiusNdcX &&
    Math.abs(ndc.y) <= 1 + prefetchMargin + radiusNdcY;

  if (nearViewport) {
    return {
      visibility: "prefetch",
      projectedRadiusPx,
      salience: Math.min(salience, 0.2),
    };
  }

  return HIDDEN_CAMERA_ASSET_INTEREST;
};

export const cameraAssetInterestEquals = (
  left: CameraAssetInterest,
  right: CameraAssetInterest
) => left.visibility === right.visibility && left.salience === right.salience;

export const isCameraAssetInterestPromotion = (
  previous: CameraAssetInterest,
  next: CameraAssetInterest
) => {
  const visibilityRank: Record<CameraAssetVisibility, number> = {
    hidden: 0,
    prefetch: 1,
    visible: 2,
  };

  return (
    visibilityRank[next.visibility] > visibilityRank[previous.visibility] ||
    next.salience > previous.salience
  );
};
