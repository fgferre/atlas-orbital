import type { StarfieldLoadStatus } from "./starfield";

export const SCENE_READY_REQUIRED_FRAMES = 6;

export const isCriticalStarfieldReady = (
  showStarfield: boolean,
  status: StarfieldLoadStatus | undefined
) => {
  if (!showStarfield) {
    return true;
  }

  return status === "loading" || status === "ready" || status === "error";
};

export const canMarkSceneReady = (
  criticalAssetsReady: boolean,
  renderedFrames: number,
  requiredFrames = SCENE_READY_REQUIRED_FRAMES
) => criticalAssetsReady && renderedFrames >= requiredFrames;
