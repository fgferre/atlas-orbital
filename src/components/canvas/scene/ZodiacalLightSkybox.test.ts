import { describe, expect, it } from "vitest";

import { ZODIACAL_RECENTER_PRIORITY } from "./ZodiacalLightSkybox";

// 2026-07-29 regression lock for the "camera outruns its own shell"
// bug (root-caused in `tasks/waves/galaxy-volumetric-2026-07-29.md`
// §0.1). `ZodiacalLightSkybox` mounts before `CameraController` in
// `Scene.tsx`, so its recentre `useFrame` MUST run at a priority
// strictly between the camera-position writers (`CameraController`,
// `SurfaceModeFirstPerson`, `NormalizedWheelZoom`, ... — all default
// R3F priority, `0`) and the render pass (`EffectComposer` /
// `DirectRenderPass`, both priority `1` — see `Scene.tsx:163` and
// `@react-three/postprocessing`'s `EffectComposer` default
// `renderPriority`). Outside that open interval the fix regresses:
// `<= 0` restores the one-frame lag (and with it the HYG fly-to
// outrun, since stride = distance/20 at MAX_VELOCITY_FACTOR = 3.0
// exceeds the 1e8 wu shell past ~9.7 pc); `>= 1` recentres AFTER the
// frame has already been rasterised, one frame late in the other
// direction.
//
// There is no cheap way to assert the actual same-tick ordering
// without a full R3F test-renderer + frame-loop harness (this repo
// has neither — see the sibling `*.test.ts` files under
// `components/canvas/`, which all pin pure values/functions instead
// of mounting the R3F tree). This test pins the one thing that is
// both pure and load-bearing: the exported priority constant itself,
// against the two sibling priorities it must sit between.
describe("ZODIACAL_RECENTER_PRIORITY", () => {
  it("sits strictly between the default camera-writer priority (0) and the render-pass priority (1)", () => {
    expect(ZODIACAL_RECENTER_PRIORITY).toBeGreaterThan(0);
    expect(ZODIACAL_RECENTER_PRIORITY).toBeLessThan(1);
  });
});
