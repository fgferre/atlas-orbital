import { describe, expect, it } from "vitest";

import {
  calculatePerspectiveRadiusPx,
  createHiddenSunScreenState,
  isWithinScreenMargin,
  resolveVisualRadiusWorld,
} from "./useSunScreenProjection";

describe("useSunScreenProjection helpers", () => {
  it("creates a hidden default state anchored to the viewport center", () => {
    expect(createHiddenSunScreenState(800, 600)).toEqual({
      visible: false,
      screenX: 400,
      screenY: 300,
      radiusPx: 0,
      viewportWidth: 800,
      viewportHeight: 600,
      ndcZ: Number.POSITIVE_INFINITY,
    });
  });

  it("computes a larger apparent radius for larger bodies at the same distance", () => {
    const small = calculatePerspectiveRadiusPx(10, 1000, 45, 1000);
    const large = calculatePerspectiveRadiusPx(20, 1000, 45, 1000);

    expect(small).toBeGreaterThan(0);
    expect(large).toBeCloseTo(small * 2, 5);
  });

  it("clips visibility using a configurable screen margin", () => {
    expect(isWithinScreenMargin(10, 10, 100, 100, 5)).toBe(true);
    expect(isWithinScreenMargin(-4, 50, 100, 100, 5)).toBe(true);
    expect(isWithinScreenMargin(-6, 50, 100, 100, 5)).toBe(false);
    expect(isWithinScreenMargin(50, 106, 100, 100, 5)).toBe(false);
  });

  it("resolves the visual world radius from scale mode instead of relying on parent scale", () => {
    const didactic = resolveVisualRadiusWorld({
      radiusKm: 696340,
      scaleMode: "didactic",
    });
    const realistic = resolveVisualRadiusWorld({
      radiusKm: 696340,
      scaleMode: "realistic",
    });

    expect(didactic).toBeGreaterThan(10);
    expect(realistic).toBeGreaterThan(0);
    expect(didactic).not.toBe(realistic);
  });
});
