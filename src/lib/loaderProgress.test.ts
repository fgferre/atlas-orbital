import { describe, expect, it } from "vitest";
import { canExitLoader, getNextLoaderDisplayProgress } from "./loaderProgress";

describe("loaderProgress", () => {
  it("pins the counter to 100 once the scene is truly ready", () => {
    const nextValue = getNextLoaderDisplayProgress(46, 100, "ready");

    expect(nextValue).toBe(100);
  });

  it("settles directly on the target when the difference is negligible", () => {
    expect(getNextLoaderDisplayProgress(99.8, 100, "ready")).toBe(100);
  });

  it("never runs the meter backward when a stage regression lowers the target", () => {
    // 90 % already shown, stage drops back to the assets band (~70 %):
    // the bar must hold, not animate down.
    expect(getNextLoaderDisplayProgress(90, 70, "render")).toBe(90);
    expect(getNextLoaderDisplayProgress(82, 18, "assets")).toBe(82);
    // A small backward nudge inside the snap threshold is also held.
    expect(getNextLoaderDisplayProgress(50, 49.9, "assets")).toBe(50);
  });

  it("only allows the loader to exit once the scene is ready and the meter caught up", () => {
    expect(canExitLoader(false, 100)).toBe(false);
    expect(canExitLoader(true, 96)).toBe(false);
    expect(canExitLoader(true, 99.6)).toBe(true);
  });
});
