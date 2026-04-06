import type { StarfieldLoadStatus } from "./starfield";

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
  requiredFrames = 2
) => criticalAssetsReady && renderedFrames >= requiredFrames;
