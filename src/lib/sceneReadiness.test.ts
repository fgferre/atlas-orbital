import { describe, expect, it } from "vitest";
import { canMarkSceneReady, isCriticalStarfieldReady } from "./sceneReadiness";

describe("sceneReadiness", () => {
  it("treats hidden starfield as ready", () => {
    expect(isCriticalStarfieldReady(false, "idle")).toBe(true);
  });

  it("treats ready and error starfield states as non-blocking", () => {
    expect(isCriticalStarfieldReady(true, "loading")).toBe(true);
    expect(isCriticalStarfieldReady(true, "ready")).toBe(true);
    expect(isCriticalStarfieldReady(true, "error")).toBe(true);
    expect(isCriticalStarfieldReady(true, "idle")).toBe(false);
  });

  it("marks the scene ready only after critical assets and enough frames", () => {
    expect(canMarkSceneReady(false, 8)).toBe(false);
    expect(canMarkSceneReady(true, 1)).toBe(false);
    expect(canMarkSceneReady(true, 2)).toBe(true);
  });
});
