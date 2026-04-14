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

  it("only allows the loader to exit once the scene is ready and the meter caught up", () => {
    expect(canExitLoader(false, 100)).toBe(false);
    expect(canExitLoader(true, 96)).toBe(false);
    expect(canExitLoader(true, 99.6)).toBe(true);
  });
});
