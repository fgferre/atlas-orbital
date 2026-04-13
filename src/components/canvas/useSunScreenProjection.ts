import { useFrame, useThree } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import * as THREE from "three";

import { AstroPhysics, KM_TO_3D_UNITS } from "../../lib/astrophysics";

export interface SunScreenState {
  visible: boolean;
  screenX: number;
  screenY: number;
  radiusPx: number;
  viewportWidth: number;
  viewportHeight: number;
  ndcZ: number;
}

const DEFAULT_SCREEN_MARGIN_PX = 48;
const SCREEN_MARGIN_MULTIPLIER = 2.4;

export const createHiddenSunScreenState = (
  viewportWidth = 0,
  viewportHeight = 0
): SunScreenState => ({
  visible: false,
  screenX: viewportWidth * 0.5,
  screenY: viewportHeight * 0.5,
  radiusPx: 0,
  viewportWidth,
  viewportHeight,
  ndcZ: Number.POSITIVE_INFINITY,
});

export const calculatePerspectiveRadiusPx = (
  worldRadius: number,
  distanceToCamera: number,
  verticalFovDegrees: number,
  viewportHeight: number
) => {
  if (
    worldRadius <= 0 ||
    distanceToCamera <= 0 ||
    verticalFovDegrees <= 0 ||
    viewportHeight <= 0
  ) {
    return 0;
  }

  const verticalFovRadians = THREE.MathUtils.degToRad(verticalFovDegrees);
  const worldPerPixel =
    (2 * distanceToCamera * Math.tan(verticalFovRadians * 0.5)) /
    viewportHeight;

  if (!Number.isFinite(worldPerPixel) || worldPerPixel <= 0) {
    return 0;
  }

  return worldRadius / worldPerPixel;
};

export const resolveVisualRadiusWorld = ({
  radiusKm,
  scaleMode,
  shapeScale = [1, 1, 1],
}: {
  radiusKm: number;
  scaleMode: "didactic" | "realistic";
  shapeScale?: [number, number, number];
}) => {
  const baseRadius =
    scaleMode === "didactic"
      ? AstroPhysics.calculateDidacticRadius(radiusKm)
      : radiusKm * KM_TO_3D_UNITS;

  return (
    baseRadius *
    Math.max(
      Math.abs(shapeScale[0]),
      Math.abs(shapeScale[1]),
      Math.abs(shapeScale[2])
    )
  );
};

export const isWithinScreenMargin = (
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  marginPx: number
) =>
  screenX >= -marginPx &&
  screenX <= viewportWidth + marginPx &&
  screenY >= -marginPx &&
  screenY <= viewportHeight + marginPx;

const writeHiddenState = (
  target: SunScreenState,
  viewportWidth: number,
  viewportHeight: number
) => {
  target.visible = false;
  target.screenX = viewportWidth * 0.5;
  target.screenY = viewportHeight * 0.5;
  target.radiusPx = 0;
  target.viewportWidth = viewportWidth;
  target.viewportHeight = viewportHeight;
  target.ndcZ = Number.POSITIVE_INFINITY;
};

export const useSunScreenProjection = ({
  outputRef,
  enabled,
  targetName = "sun",
  explicitWorldRadius,
}: {
  outputRef: MutableRefObject<SunScreenState>;
  enabled: boolean;
  targetName?: string;
  explicitWorldRadius?: number;
}) => {
  const { scene, camera } = useThree();
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const projected = new THREE.Vector3();

  useFrame(({ size }) => {
    const { width, height } = size;
    const output = outputRef.current;

    if (!enabled) {
      writeHiddenState(output, width, height);
      return;
    }

    const target = scene.getObjectByName(targetName);
    if (!target || !(camera instanceof THREE.PerspectiveCamera)) {
      writeHiddenState(output, width, height);
      return;
    }

    target.getWorldPosition(worldPosition);
    target.getWorldScale(worldScale);

    const measuredWorldRadius = Math.max(
      Math.abs(worldScale.x),
      Math.abs(worldScale.y),
      Math.abs(worldScale.z)
    );
    const worldRadius =
      explicitWorldRadius && explicitWorldRadius > 0
        ? explicitWorldRadius
        : measuredWorldRadius;
    const distanceToCamera = camera.position.distanceTo(worldPosition);
    const radiusPx = calculatePerspectiveRadiusPx(
      worldRadius,
      distanceToCamera,
      camera.fov,
      height
    );

    projected.copy(worldPosition).project(camera);

    const screenX = (projected.x * 0.5 + 0.5) * width;
    const screenY = (projected.y * -0.5 + 0.5) * height;
    const marginPx = Math.max(
      DEFAULT_SCREEN_MARGIN_PX,
      radiusPx * SCREEN_MARGIN_MULTIPLIER
    );

    output.visible =
      projected.z > -1 &&
      projected.z < 1 &&
      radiusPx > 0.25 &&
      isWithinScreenMargin(screenX, screenY, width, height, marginPx);
    output.screenX = screenX;
    output.screenY = screenY;
    output.radiusPx = radiusPx;
    output.viewportWidth = width;
    output.viewportHeight = height;
    output.ndcZ = projected.z;
  }, 11);
};
