import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireDeferredTexture,
  estimateTextureByteSize,
  estimateTextureByteSizeFromDimensions,
  getDeferredTextureCacheStatsForTests,
  getDeferredTextureSnapshot,
  releaseDeferredTexture,
  resetDeferredTextureCacheForTests,
  resolveDeferredTextureBudget,
  selectEvictionVictims,
  setDeferredTextureBudget,
  subscribeToDeferredTexture,
} from "./deferredTextureCache";

describe("deferredTextureCache", () => {
  const makeLoadedTexture = (width: number, height: number) =>
    new THREE.Texture({
      width,
      height,
    }) as unknown as THREE.Texture<HTMLImageElement>;

  afterEach(() => {
    resetDeferredTextureCacheForTests();
    vi.restoreAllMocks();
  });

  it("estimates tiered texture sizes including mipmaps", () => {
    expect(estimateTextureByteSize("/textures/8k_earth_daymap.jpg")).toBe(
      Math.ceil(8192 * 8192 * 4 * (4 / 3))
    );
    expect(estimateTextureByteSize("/textures/boot_earth_daymap.jpg")).toBe(
      Math.ceil(1024 * 1024 * 4 * (4 / 3))
    );
    expect(estimateTextureByteSizeFromDimensions(8192, 4096)).toBe(
      Math.ceil(8192 * 4096 * 4 * (4 / 3))
    );
  });

  it("resolves finite budgets for every quality profile", () => {
    expect(resolveDeferredTextureBudget("ultra")).toBe(512 * 1024 * 1024);
    expect(resolveDeferredTextureBudget("high")).toBe(256 * 1024 * 1024);
    expect(resolveDeferredTextureBudget("balanced")).toBe(64 * 1024 * 1024);
    expect(resolveDeferredTextureBudget("constrained")).toBe(32 * 1024 * 1024);
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

  it("limits concurrent image decodes and starts the next queued priority", async () => {
    const pending: Array<(texture: THREE.Texture<HTMLImageElement>) => void> =
      [];
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
      () =>
        new Promise<THREE.Texture<HTMLImageElement>>((resolve) => {
          pending.push(resolve);
        })
    );

    for (let index = 0; index < 5; index += 1) {
      acquireDeferredTexture(`/textures/${index}.jpg`, {
        priority: index === 4 ? 0 : 2,
      });
    }

    expect(getDeferredTextureCacheStatsForTests()).toMatchObject({
      activeLoadCount: 4,
      queuedLoadCount: 1,
    });

    pending[0](makeLoadedTexture(16, 8));
    await vi.waitFor(() => expect(pending).toHaveLength(5));

    for (const resolve of pending.slice(1)) {
      resolve(makeLoadedTexture(16, 8));
    }
    await vi.waitFor(() =>
      expect(getDeferredTextureCacheStatsForTests().activeLoadCount).toBe(0)
    );
  });

  it("disposes an unreferenced texture when the finite budget is exceeded", async () => {
    const texture = makeLoadedTexture(8192, 4096);
    const dispose = vi.spyOn(texture, "dispose");
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(
      texture
    );
    setDeferredTextureBudget(1);

    acquireDeferredTexture("/textures/8k_test.jpg", { priority: 0 });
    await vi.waitFor(() =>
      expect(getDeferredTextureSnapshot("/textures/8k_test.jpg").status).toBe(
        "ready"
      )
    );

    releaseDeferredTexture("/textures/8k_test.jpg");
    await vi.waitFor(() =>
      expect(getDeferredTextureSnapshot("/textures/8k_test.jpg").status).toBe(
        "idle"
      )
    );

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("discards a decode that finished after its camera consumer left", async () => {
    let resolveLoad!: (texture: THREE.Texture<HTMLImageElement>) => void;
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
      () =>
        new Promise<THREE.Texture<HTMLImageElement>>((resolve) => {
          resolveLoad = resolve;
        })
    );
    const texture = makeLoadedTexture(2048, 1024);
    const dispose = vi.spyOn(texture, "dispose");

    acquireDeferredTexture("/textures/2k_left-camera.jpg", { priority: 1 });
    releaseDeferredTexture("/textures/2k_left-camera.jpg");
    resolveLoad(texture);

    await vi.waitFor(() =>
      expect(
        getDeferredTextureSnapshot("/textures/2k_left-camera.jpg").status
      ).toBe("idle")
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});
