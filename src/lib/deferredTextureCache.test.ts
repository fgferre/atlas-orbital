import { afterEach, describe, expect, it } from "vitest";
import {
  estimateTextureByteSize,
  getDeferredTextureSnapshot,
  resetDeferredTextureCacheForTests,
  resolveDeferredTextureBudget,
  selectEvictionVictims,
  subscribeToDeferredTexture,
} from "./deferredTextureCache";

describe("deferredTextureCache", () => {
  afterEach(() => {
    resetDeferredTextureCacheForTests();
  });

  it("estimates tiered texture sizes from filenames", () => {
    expect(estimateTextureByteSize("/textures/8k_earth_daymap.jpg")).toBe(
      8192 * 8192 * 4
    );
    expect(estimateTextureByteSize("/textures/boot_earth_daymap.jpg")).toBe(
      1024 * 1024 * 4
    );
  });

  it("resolves finite budgets only for balanced and constrained profiles", () => {
    expect(resolveDeferredTextureBudget("balanced")).toBe(64 * 1024 * 1024);
    expect(resolveDeferredTextureBudget("constrained")).toBe(32 * 1024 * 1024);
    expect(resolveDeferredTextureBudget("high")).toBeNull();
  });

  it("evicts the oldest unpinned, unreferenced textures first", () => {
    const victims = selectEvictionVictims(
      [
        {
          url: "focused",
          estimatedBytes: 20,
          refCount: 1,
          pinCount: 1,
          lastUsedAt: 1,
        },
        {
          url: "secondary-old",
          estimatedBytes: 18,
          refCount: 0,
          pinCount: 0,
          lastUsedAt: 2,
        },
        {
          url: "secondary-new",
          estimatedBytes: 18,
          refCount: 0,
          pinCount: 0,
          lastUsedAt: 3,
        },
      ],
      36
    );

    expect(victims).toEqual(["secondary-old", "secondary-new"]);
  });

  it("returns stable snapshots between reads when nothing changed", () => {
    const missingFirst = getDeferredTextureSnapshot("/textures/missing.jpg");
    const missingSecond = getDeferredTextureSnapshot("/textures/missing.jpg");

    expect(missingFirst).toBe(missingSecond);

    const unsubscribe = subscribeToDeferredTexture(
      "/textures/existing.jpg",
      () => {}
    );
    const existingFirst = getDeferredTextureSnapshot("/textures/existing.jpg");
    const existingSecond = getDeferredTextureSnapshot("/textures/existing.jpg");

    expect(existingFirst).toBe(existingSecond);
    unsubscribe();
  });
});
