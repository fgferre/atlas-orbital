import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMERA_NEAR,
  DEFAULT_CONTROLS_MIN_DISTANCE,
  resolveFocusNearPlane,
} from "./cameraNearPlane";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";

// N-2 regression lock. The focus effect in CameraController tightens
// `camera.near` to 1 % of `minDistance` so a 6 km moon doesn't clip.
// It used to early-return on `!focusId`, so the tightened near plane
// survived the defocus and every subsequent frame of the WHOLE scene
// rendered against it (Deimos: near 4.41e-7 vs far 1e15 → a 2.27e21
// depth ratio, i.e. depth-buffer precision collapse). The defocus
// branch must restore the Scene.tsx defaults.

const radiusWuFor = (id: string): number => {
  const body = BODIES_BY_ID.get(id);
  if (!body) throw new Error(`${id} missing from BODIES_BY_ID`);
  return AstroPhysics.resolveSemanticBodyRadius({
    body,
    scaleMode: "realistic",
  });
};

const deimosRadiusWu = (): number => radiusWuFor("deimos");

describe("resolveFocusNearPlane", () => {
  it("tightens near + minDistance while a tiny moon is focused", () => {
    const focused = resolveFocusNearPlane(deimosRadiusWu());

    expect(focused.minDistance).toBeCloseTo(deimosRadiusWu() * 1.1, 12);
    expect(focused.near).toBeCloseTo(focused.minDistance * 0.01, 14);
    // The measured leak value — well below the 0.1 default.
    expect(focused.near).toBeLessThan(1e-6);
    expect(focused.minDistance).toBeLessThan(DEFAULT_CONTROLS_MIN_DISTANCE);
  });

  it("restores the Scene defaults on defocus (focus -> null)", () => {
    const focused = resolveFocusNearPlane(deimosRadiusWu());
    const defocused = resolveFocusNearPlane(null);

    expect(defocused.near).toBe(DEFAULT_CAMERA_NEAR);
    expect(defocused.minDistance).toBe(DEFAULT_CONTROLS_MIN_DISTANCE);
    // And the restore is a real change, not a coincidence.
    expect(defocused.near).toBeGreaterThan(focused.near);
    expect(defocused.minDistance).toBeGreaterThan(focused.minDistance);
  });

  it("keeps the far/near depth ratio sane after defocus", () => {
    const FAR = 1e15; // Scene.tsx camera config
    const focused = resolveFocusNearPlane(deimosRadiusWu());
    const defocused = resolveFocusNearPlane(null);

    expect(FAR / focused.near).toBeGreaterThan(1e20); // the leak
    expect(FAR / defocused.near).toBe(1e16); // restored
  });

  it("floors near at 1e-7 for a degenerate (zero-radius) focus", () => {
    expect(resolveFocusNearPlane(0).near).toBe(1e-7);
    expect(resolveFocusNearPlane(0).minDistance).toBe(0);
  });

  it("does not clamp minDistance for a supergiant focus", () => {
    const betelgeuseRadiusWu = 4128;
    const focused = resolveFocusNearPlane(betelgeuseRadiusWu);

    expect(focused.minDistance).toBeCloseTo(betelgeuseRadiusWu * 1.1, 6);
    expect(focused.near).toBeCloseTo(betelgeuseRadiusWu * 1.1 * 0.01, 6);
  });
});

describe("focus -> defocus cycle applied to camera + controls", () => {
  // Thin stand-ins for the two objects the CameraController focus
  // effect mutates. Mirrors the effect's write path: resolve radius ->
  // write minDistance -> write near (guarded) -> updateProjectionMatrix.
  const makeRig = () => ({
    camera: {
      near: DEFAULT_CAMERA_NEAR,
      far: 1e15,
      projectionUpdates: 0,
      updateProjectionMatrix() {
        this.projectionUpdates += 1;
      },
    },
    controls: { minDistance: DEFAULT_CONTROLS_MIN_DISTANCE },
  });

  const applyFocus = (
    rig: ReturnType<typeof makeRig>,
    radius: number | null
  ) => {
    const { minDistance, near } = resolveFocusNearPlane(radius);
    rig.controls.minDistance = minDistance;
    if (Math.abs(rig.camera.near - near) > 1e-8) {
      rig.camera.near = near;
      rig.camera.updateProjectionMatrix();
    }
  };

  it("returns near + minDistance to the boot values after defocus", () => {
    const rig = makeRig();
    const bootNear = rig.camera.near;
    const bootMinDistance = rig.controls.minDistance;

    applyFocus(rig, deimosRadiusWu());
    expect(rig.camera.near).toBeLessThan(1e-6);
    expect(rig.camera.projectionUpdates).toBe(1);

    applyFocus(rig, null);
    expect(rig.camera.near).toBe(bootNear);
    expect(rig.controls.minDistance).toBe(bootMinDistance);
    expect(rig.camera.projectionUpdates).toBe(2);
  });

  it("survives repeated focus/defocus without drifting", () => {
    const rig = makeRig();

    for (const id of ["deimos", "phobos", "jupiter"]) {
      applyFocus(rig, radiusWuFor(id));
      applyFocus(rig, null);
      expect(rig.camera.near).toBe(DEFAULT_CAMERA_NEAR);
      expect(rig.controls.minDistance).toBe(DEFAULT_CONTROLS_MIN_DISTANCE);
    }
  });

  it("skips the projection-matrix rebuild when defocusing from defocused", () => {
    const rig = makeRig();

    applyFocus(rig, null);
    expect(rig.camera.projectionUpdates).toBe(0);
    expect(rig.camera.near).toBe(DEFAULT_CAMERA_NEAR);
    expect(rig.controls.minDistance).toBe(DEFAULT_CONTROLS_MIN_DISTANCE);
  });
});
