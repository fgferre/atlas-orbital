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
    // Every planetary map here is 2:1 equirectangular, so the tier token
    // names the long edge. `8k_earth_daymap.jpg` really is 8192x4096.
    expect(estimateTextureByteSize("/textures/8k_earth_daymap.jpg")).toBe(
      Math.ceil(8192 * 4096 * 4 * (4 / 3))
    );
    expect(estimateTextureByteSize("/textures/boot_earth_daymap.jpg")).toBe(
      Math.ceil(1024 * 512 * 4 * (4 / 3))
    );
    expect(estimateTextureByteSizeFromDimensions(8192, 4096)).toBe(
      Math.ceil(8192 * 4096 * 4 * (4 / 3))
    );
  });

  it("bounds an untiered filename from above rather than below", () => {
    // The admission gate reads this estimate before a byte is fetched, so
    // the direction of the error matters more than its size. `jupiter_vgr1_2025.jpg`
    // carries no tier token and is really 7200x3600: the old 1024 default
    // scored it at 5.6 MB against a real 131.8 MB.
    expect(estimateTextureByteSize("/textures/jupiter_vgr1_2025.jpg")).toBe(
      estimateTextureByteSizeFromDimensions(8192, 4096)
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

    // `2k_` fixtures, not untiered ones: an untiered basename now estimates
    // at the 8192x4096 upper bound, and five of those would be gated by
    // admission control rather than by the concurrency cap this test is
    // about. At 2k the five fit the 64 MB post-reset budget, so the
    // assertion below still proves the cap — and now also proves that
    // admission control does not throttle a load the budget can afford.
    for (let index = 0; index < 5; index += 1) {
      acquireDeferredTexture(`/textures/2k_${index}.jpg`, {
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

  it("stops admitting decodes once in-flight bytes reach the budget", () => {
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
      () => new Promise<THREE.Texture<HTMLImageElement>>(() => {})
    );
    setDeferredTextureBudget(resolveDeferredTextureBudget("constrained"));

    for (const url of [
      "/textures/8k_earth_daymap.jpg",
      "/textures/8k_earth_clouds.jpg",
      "/textures/8k_earth_nightmap.jpg",
      "/textures/8k_earth_normal_map.jpg",
      "/textures/8k_earth_roughness_map.jpg",
    ]) {
      acquireDeferredTexture(url, { priority: 0 });
    }

    // The measured defect this fixes: a 32 MB budget with 8 acquires used to
    // report activeLoadCount 4 and readyBytes 0 — roughly 683 MB of decode
    // in flight and entirely invisible to the budget. The progress rule still
    // admits one so the body always renders; nothing joins it.
    const stats = getDeferredTextureCacheStatsForTests();
    expect(stats.activeLoadCount).toBe(1);
    expect(stats.queuedLoadCount).toBe(4);
    expect(stats.inFlightBytes).toBe(
      estimateTextureByteSizeFromDimensions(8192, 4096)
    );
  });

  it("releases the queue when an admitted load never settles", async () => {
    // Liveness, not politeness. One 8k entry charges more than the whole
    // `balanced` budget, so while it is in flight nothing else can be
    // admitted and `activeLoadCount` never returns to zero. Without a
    // deadline a single stalled socket would freeze every texture in the
    // app until a reload.
    vi.useFakeTimers();
    try {
      vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
        (url: string) =>
          url.includes("stalled")
            ? new Promise<THREE.Texture<HTMLImageElement>>(() => {})
            : Promise.resolve(makeLoadedTexture(2048, 1024))
      );
      setDeferredTextureBudget(resolveDeferredTextureBudget("balanced"));

      acquireDeferredTexture("/textures/8k_stalled.jpg", { priority: 0 });
      acquireDeferredTexture("/textures/2k_behind.jpg", { priority: 1 });

      expect(getDeferredTextureCacheStatsForTests()).toMatchObject({
        activeLoadCount: 1,
        queuedLoadCount: 1,
      });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(
        getDeferredTextureSnapshot("/textures/8k_stalled.jpg").status
      ).toBe("error");
      expect(getDeferredTextureCacheStatsForTests().inFlightBytes).toBe(0);
      await vi.waitFor(() =>
        expect(
          getDeferredTextureSnapshot("/textures/2k_behind.jpg").status
        ).toBe("ready")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries once after a timeout instead of stranding the texture", async () => {
    // The bug this fixes: a component that stays mounted with unchanged
    // `useDeferredTexture` deps never calls `acquireDeferredTexture` again,
    // so a stuck `"error"` entry used to be a permanent downgrade for that
    // mount. One bounded automatic retry recovers it without a full retry
    // framework.
    vi.useFakeTimers();
    try {
      let attempt = 0;
      vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
        () => {
          attempt += 1;
          return attempt === 1
            ? new Promise<THREE.Texture<HTMLImageElement>>(() => {}) // first attempt stalls forever
            : Promise.resolve(makeLoadedTexture(2048, 1024)); // retry succeeds
        }
      );

      acquireDeferredTexture("/textures/2k_retry.jpg", { priority: 0 });

      await vi.advanceTimersByTimeAsync(60_000); // LOAD_TIMEOUT_MS
      expect(getDeferredTextureSnapshot("/textures/2k_retry.jpg").status).toBe(
        "error"
      );

      await vi.advanceTimersByTimeAsync(5_000); // LOAD_TIMEOUT_RETRY_DELAY_MS
      await vi.waitFor(() =>
        expect(
          getDeferredTextureSnapshot("/textures/2k_retry.jpg").status
        ).toBe("ready")
      );
      expect(attempt).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let a stale priority stamp outrank the focused body", async () => {
    const requested: string[] = [];
    const pending: Array<(texture: THREE.Texture<HTMLImageElement>) => void> =
      [];
    vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockImplementation(
      (url: string) => {
        requested.push(url);
        return new Promise<THREE.Texture<HTMLImageElement>>((resolve) => {
          pending.push(resolve);
        });
      }
    );
    setDeferredTextureBudget(resolveDeferredTextureBudget("balanced"));

    // Body A is focused once and fully loads, then the camera leaves and
    // the budget evicts it back to idle. Its priority-0 stamp must not
    // survive into its next life as a distant background body.
    acquireDeferredTexture("/textures/8k_body-a.jpg", { priority: 0 });
    pending[0](makeLoadedTexture(8192, 4096));
    await vi.waitFor(() =>
      expect(getDeferredTextureSnapshot("/textures/8k_body-a.jpg").status).toBe(
        "ready"
      )
    );
    releaseDeferredTexture("/textures/8k_body-a.jpg");
    await vi.waitFor(() =>
      expect(getDeferredTextureSnapshot("/textures/8k_body-a.jpg").status).toBe(
        "idle"
      )
    );

    // One heavy decode now occupies the only slot this budget allows.
    acquireDeferredTexture("/textures/8k_blocker.jpg", { priority: 2 });
    // Body A returns as a background body; body B is what the user just focused.
    acquireDeferredTexture("/textures/8k_body-a.jpg", { priority: 3 });
    acquireDeferredTexture("/textures/8k_body-b-focused.jpg", { priority: 0 });

    expect(requested).toEqual([
      "/textures/8k_body-a.jpg",
      "/textures/8k_blocker.jpg",
    ]);

    pending[1](makeLoadedTexture(16, 8));
    await vi.waitFor(() => expect(requested).toHaveLength(3));

    // The freed slot goes to the body the user is looking at.
    expect(requested[2]).toBe("/textures/8k_body-b-focused.jpg");
  });
});
