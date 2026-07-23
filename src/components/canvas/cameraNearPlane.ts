/**
 * N-2 — focus-driven near-plane / dolly-floor resolution.
 *
 * Lives outside `CameraController.tsx` so the Fast Refresh rule
 * (react-refresh/only-export-components) stays clean and the
 * decision is independently unit-testable without mounting the
 * full R3F scene.
 */

/**
 * Scene-level camera/controls defaults, mirrored from the JSX in
 * `src/components/canvas/Scene.tsx`: the `<Canvas camera>` config
 * (`near: 0.1`) and the `<OrbitControls minDistance={10}>` prop.
 * Both are declared inline as props there, so there is no exported
 * constant to import — these mirror them and must stay in sync.
 */
export const DEFAULT_CAMERA_NEAR = 0.1;
export const DEFAULT_CONTROLS_MIN_DISTANCE = 10;

/**
 * Resolve `(controls.minDistance, camera.near)` for a focus state.
 *
 * `focusRadiusWu === null` means "no focus": the camera goes back to
 * the Scene defaults. Before this restore existed, defocusing left the
 * last focused body's near plane applied to the WHOLE scene — focusing
 * Deimos tightens `near` to 4.41e-7 against `far = 1e15` (a 2.27e21
 * depth ratio), which wrecks depth precision everywhere once the
 * camera is no longer parked next to a 6 km moon.
 *
 * The `1.1` dolly margin and the `0.01` near/minDistance ratio are the
 * pre-existing focus tuning; only the null branch is new.
 */
export const resolveFocusNearPlane = (
  focusRadiusWu: number | null
): { minDistance: number; near: number } => {
  if (focusRadiusWu === null) {
    return {
      minDistance: DEFAULT_CONTROLS_MIN_DISTANCE,
      near: DEFAULT_CAMERA_NEAR,
    };
  }

  const minDistance = focusRadiusWu * 1.1;
  return { minDistance, near: Math.max(1e-7, minDistance * 0.01) };
};
