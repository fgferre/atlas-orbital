import { describe, it, expect } from "vitest";
import {
  SURFACE_LOOK_MOUSE_SENSITIVITY_RAD_PER_PX,
  SURFACE_LOOK_ROLL_RAD_PER_SEC,
  SURFACE_LOOK_MAX_PITCH_RAD,
  computeMouseLookDelta,
  clampPitch,
  computeRollDelta,
} from "./surfaceLook";

describe("T4.2-β-handler Silver — constants pinned", () => {
  it("mouse sensitivity matches AAA FPS default (0.002 rad/px)", () => {
    expect(SURFACE_LOOK_MOUSE_SENSITIVITY_RAD_PER_PX).toBe(0.002);
  });

  it("roll rate is 90°/sec (π/2 rad/s)", () => {
    expect(SURFACE_LOOK_ROLL_RAD_PER_SEC).toBeCloseTo(Math.PI / 2, 12);
  });

  it("max pitch is π/2 minus 0.01 rad (gimbal-lock headroom)", () => {
    expect(SURFACE_LOOK_MAX_PITCH_RAD).toBeCloseTo(Math.PI / 2 - 0.01, 12);
  });
});

describe("computeMouseLookDelta — sign convention", () => {
  it("mouse right (+movementX) produces negative yaw (→ rotateY right = look right)", () => {
    const delta = computeMouseLookDelta(100, 0);
    expect(delta.yaw).toBe(-100 * 0.002); // -0.2 rad
    expect(delta.pitch).toBeCloseTo(0, 12);
  });

  it("mouse left (-movementX) produces positive yaw", () => {
    const delta = computeMouseLookDelta(-100, 0);
    expect(delta.yaw).toBe(0.2);
    expect(delta.pitch).toBeCloseTo(0, 12);
  });

  it("mouse down (+movementY) produces negative pitch (→ rotateX(-) = look down)", () => {
    const delta = computeMouseLookDelta(0, 100);
    expect(delta.yaw).toBeCloseTo(0, 12);
    expect(delta.pitch).toBe(-0.2);
  });

  it("mouse up (-movementY) produces positive pitch (→ rotateX(+) = look up)", () => {
    const delta = computeMouseLookDelta(0, -100);
    expect(delta.yaw).toBeCloseTo(0, 12);
    expect(delta.pitch).toBe(0.2);
  });

  it("zero movement produces zero delta on both axes", () => {
    const delta = computeMouseLookDelta(0, 0);
    expect(delta.yaw).toBeCloseTo(0, 12);
    expect(delta.pitch).toBeCloseTo(0, 12);
  });

  it("custom sensitivity scales both axes linearly", () => {
    const delta = computeMouseLookDelta(50, 50, 0.005);
    expect(delta.yaw).toBe(-50 * 0.005);
    expect(delta.pitch).toBe(-50 * 0.005);
  });
});

describe("clampPitch — gimbal-lock guard", () => {
  it("passes values within ±MAX unchanged", () => {
    expect(clampPitch(0)).toBe(0);
    expect(clampPitch(1.0)).toBe(1.0);
    expect(clampPitch(-1.0)).toBe(-1.0);
    expect(clampPitch(1.5)).toBe(1.5);
    expect(clampPitch(-1.5)).toBe(-1.5);
  });

  it("clamps values exceeding +MAX down to +MAX", () => {
    const above = SURFACE_LOOK_MAX_PITCH_RAD + 0.1;
    expect(clampPitch(above)).toBe(SURFACE_LOOK_MAX_PITCH_RAD);
  });

  it("clamps values exceeding -MAX up to -MAX", () => {
    const below = -SURFACE_LOOK_MAX_PITCH_RAD - 0.1;
    expect(clampPitch(below)).toBe(-SURFACE_LOOK_MAX_PITCH_RAD);
  });

  it("honors a custom clamp bound", () => {
    expect(clampPitch(1.0, 0.5)).toBe(0.5);
    expect(clampPitch(-1.0, 0.5)).toBe(-0.5);
  });

  it("accumulator idiom yields correct effectiveDelta at the clamp", () => {
    // Simulate a user spamming mouse-down at the pole: after 100 units
    // of accumulated pitch, additional positive deltas should produce
    // zero effective rotation.
    let accum = SURFACE_LOOK_MAX_PITCH_RAD - 0.1;
    const proposed = accum + 1.0;
    const clamped = clampPitch(proposed);
    const effective = clamped - accum;
    accum = clamped;

    expect(clamped).toBe(SURFACE_LOOK_MAX_PITCH_RAD);
    expect(effective).toBeCloseTo(0.1, 12); // only the 0.1 of headroom actually applied
    expect(accum).toBe(SURFACE_LOOK_MAX_PITCH_RAD);

    // Next frame: another +1 should produce zero effective rotation.
    const proposed2 = accum + 1.0;
    const clamped2 = clampPitch(proposed2);
    expect(clamped2 - accum).toBe(0);
  });
});

describe("computeRollDelta — Q/E keys + dt", () => {
  it("Q only held produces positive roll (CCW from viewer = 'roll left')", () => {
    expect(computeRollDelta(true, false, 1)).toBe(
      SURFACE_LOOK_ROLL_RAD_PER_SEC
    );
  });

  it("E only held produces negative roll (CW from viewer = 'roll right')", () => {
    expect(computeRollDelta(false, true, 1)).toBe(
      -SURFACE_LOOK_ROLL_RAD_PER_SEC
    );
  });

  it("neither key held produces zero roll", () => {
    expect(computeRollDelta(false, false, 1)).toBe(0);
  });

  it("both keys held cancel to zero roll", () => {
    expect(computeRollDelta(true, true, 1)).toBe(0);
  });

  it("scales linearly with dt", () => {
    expect(computeRollDelta(true, false, 0.5)).toBe(
      SURFACE_LOOK_ROLL_RAD_PER_SEC * 0.5
    );
    expect(computeRollDelta(false, true, 0.25)).toBe(
      -SURFACE_LOOK_ROLL_RAD_PER_SEC * 0.25
    );
  });

  it("clamps negative dt to zero (defensive)", () => {
    expect(computeRollDelta(true, false, -1)).toBeCloseTo(0, 12);
    expect(computeRollDelta(false, true, -0.5)).toBeCloseTo(0, 12);
  });

  it("honors a custom roll rate", () => {
    expect(computeRollDelta(true, false, 1, 2.0)).toBe(2.0);
    expect(computeRollDelta(false, true, 0.5, 4.0)).toBe(-2.0);
  });
});
