// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeferredTextureSnapshot } from "../lib/deferredTextureCache";

const useDeferredTextureMock = vi.hoisted(() => vi.fn());

vi.mock("./useDeferredTexture", () => ({
  useDeferredTexture: useDeferredTextureMock,
}));

import { useProgressiveDeferredTexture } from "./useProgressiveDeferredTexture";

const idleSnapshot = (url: string | null): DeferredTextureSnapshot => ({
  url,
  status: "loading",
  texture: null,
  error: null,
  estimatedBytes: 0,
});

const readySnapshot = (
  url: string,
  texture: THREE.Texture
): DeferredTextureSnapshot => ({
  url,
  status: "ready",
  texture,
  error: null,
  estimatedBytes: 1,
});

describe("useProgressiveDeferredTexture", () => {
  beforeEach(() => {
    useDeferredTextureMock.mockReset();
  });

  it("keeps the last ready tier until its replacement is ready", async () => {
    const low = new THREE.Texture();
    const high = new THREE.Texture();
    const snapshots = new Map<string, DeferredTextureSnapshot>([
      ["2k", readySnapshot("2k", low)],
      ["8k", idleSnapshot("8k")],
    ]);

    useDeferredTextureMock.mockImplementation(
      (url: string | null, options: { enabled?: boolean } = {}) => {
        if (!url || options.enabled === false) {
          return idleSnapshot(null);
        }
        return snapshots.get(url) ?? idleSnapshot(url);
      }
    );

    const { result, rerender } = renderHook(
      ({ url }) => useProgressiveDeferredTexture(url),
      { initialProps: { url: "2k" } }
    );
    expect(result.current.texture).toBe(low);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      rerender({ url: "8k" });
      await Promise.resolve();
    });

    expect(result.current.texture).toBe(low);
    expect(result.current.retainedUrl).toBe("2k");

    snapshots.set("8k", readySnapshot("8k", high));
    await act(async () => {
      rerender({ url: "8k" });
      await Promise.resolve();
    });
    expect(result.current.texture).toBe(high);
  });
});
