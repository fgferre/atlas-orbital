import * as THREE from "three";

const MIN_ZOOM_SPEED = 0.45;
const MAX_ZOOM_SPEED = 2.4;
const ZOOM_SPEED_MULTIPLIER = 0.35;
const MIN_ZOOM_REFERENCE_DISTANCE = 10;
const PIXEL_DELTA_PER_WHEEL_STEP = 100;
const LINE_DELTA_PER_WHEEL_STEP = 3;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export const ORBIT_MOUSE_BUTTONS = Object.freeze({
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.PAN,
});

export interface FocusTrackingState {
  initialized: boolean;
  targetOffset: THREE.Vector3;
  lastFocusWorldPos: THREE.Vector3;
}

export const createFocusTrackingState = (): FocusTrackingState => ({
  initialized: false,
  targetOffset: new THREE.Vector3(),
  lastFocusWorldPos: new THREE.Vector3(),
});

export const resetFocusTrackingState = (
  state: FocusTrackingState,
  focusWorldPos?: THREE.Vector3
) => {
  state.targetOffset.set(0, 0, 0);

  if (focusWorldPos) {
    state.lastFocusWorldPos.copy(focusWorldPos);
    state.initialized = true;
    return;
  }

  state.lastFocusWorldPos.set(0, 0, 0);
  state.initialized = false;
};

export const calculateAdaptiveZoomSpeed = (
  distanceToTarget: number,
  minDistance: number
) => {
  const safeMinDistance = Math.max(minDistance, MIN_ZOOM_REFERENCE_DISTANCE);
  const relativeDistance = Math.max(distanceToTarget / safeMinDistance, 1);
  const zoomSpeed =
    MIN_ZOOM_SPEED + Math.log10(relativeDistance) * ZOOM_SPEED_MULTIPLIER;

  return THREE.MathUtils.clamp(zoomSpeed, MIN_ZOOM_SPEED, MAX_ZOOM_SPEED);
};

export const normalizeWheelDeltaToSteps = (
  deltaY: number,
  deltaMode: number
) => {
  switch (deltaMode) {
    case DOM_DELTA_LINE:
      return deltaY / LINE_DELTA_PER_WHEEL_STEP;
    case DOM_DELTA_PAGE:
      return deltaY;
    case DOM_DELTA_PIXEL:
    default:
      return deltaY / PIXEL_DELTA_PER_WHEEL_STEP;
  }
};

export const accumulateWheelZoomSteps = ({
  pendingSteps,
  deltaY,
  deltaMode,
}: {
  pendingSteps: number;
  deltaY: number;
  deltaMode: number;
}) => {
  const totalSteps =
    pendingSteps + normalizeWheelDeltaToSteps(deltaY, deltaMode);
  const stepCount =
    totalSteps > 0 ? Math.floor(totalSteps) : Math.ceil(totalSteps);
  const nextPendingSteps = totalSteps - stepCount;

  return {
    stepCount,
    pendingSteps:
      Math.abs(nextPendingSteps) < Number.EPSILON ? 0 : nextPendingSteps,
  };
};

export const resolveFocusTrackingFrame = ({
  currentTarget,
  focusWorldPos,
  state,
}: {
  currentTarget: THREE.Vector3;
  focusWorldPos: THREE.Vector3;
  state: FocusTrackingState;
}) => {
  if (!state.initialized) {
    state.lastFocusWorldPos.copy(focusWorldPos);
    state.targetOffset.copy(currentTarget).sub(focusWorldPos);
    state.initialized = true;
  }

  const expectedTarget = state.lastFocusWorldPos
    .clone()
    .add(state.targetOffset);
  const userPanDelta = currentTarget.clone().sub(expectedTarget);

  state.targetOffset.add(userPanDelta);

  const nextTarget = focusWorldPos.clone().add(state.targetOffset);
  const cameraDelta = nextTarget.clone().sub(currentTarget);

  state.lastFocusWorldPos.copy(focusWorldPos);

  return {
    nextTarget,
    cameraDelta,
  };
};
