import type { LoaderStageId } from "./loaderStages";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getNextLoaderDisplayProgress = (
  previousValue: number,
  targetValue: number,
  stageId: LoaderStageId
) => {
  const isReadyStage = stageId === "ready";

  if (isReadyStage) {
    return 100;
  }

  // Monotonic floor: the boot meter must never run backward. Stage
  // regressions (a spurious `isSceneReady`/asset-readiness bounce
  // mid-boot) collapse the target band and would otherwise animate the
  // bar *down* — `Math.sign(delta) === -1` below eases toward a lower
  // target. Holding at `previousValue` keeps the meter honest: progress
  // only ever climbs. The `ready` override above still forces 100.
  if (targetValue <= previousValue) {
    return previousValue;
  }

  const delta = targetValue - previousValue;

  if (Math.abs(delta) < 0.35) {
    return targetValue;
  }

  const stepFactor = isReadyStage ? 0.34 : 0.12;
  const minStep = isReadyStage ? 3.5 : 0.45;
  const step = Math.max(minStep, Math.abs(delta) * stepFactor);

  return clamp(previousValue + Math.sign(delta) * step, 0, 100);
};

export const canExitLoader = (isSceneReady: boolean, displayProgress: number) =>
  isSceneReady && displayProgress >= 99.5;
