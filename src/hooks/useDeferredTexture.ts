import { useCallback, useSyncExternalStore } from "react";
import type * as THREE from "three";
import {
  acquireDeferredTexture,
  getDeferredTextureSnapshot,
  releaseDeferredTexture,
  subscribeToDeferredTexture,
} from "../lib/deferredTextureCache";

const EMPTY_DEPENDENCIES = Object.freeze([]);

interface UseDeferredTextureOptions {
  enabled?: boolean;
  pin?: boolean;
  dependencies?: ReadonlyArray<unknown>;
  /**
   * Colour space to apply when the texture finishes loading. Defaults to
   * sRGB (matches the existing behaviour for colour/albedo maps). Pass
   * `THREE.NoColorSpace` for linear data channels like normal, roughness,
   * metalness or AO so the GPU samples them without gamma correction.
   */
  colorSpace?: THREE.ColorSpace;
}

export const useDeferredTexture = (
  url?: string | null,
  options: UseDeferredTextureOptions = {}
) => {
  const {
    enabled = true,
    pin = false,
    dependencies = EMPTY_DEPENDENCIES,
    colorSpace,
  } = options;
  const isActive = Boolean(url) && enabled;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!url || !isActive) {
        return () => {};
      }

      acquireDeferredTexture(url, { pin, colorSpace });
      const unsubscribe = subscribeToDeferredTexture(url, notify);

      return () => {
        unsubscribe();
        releaseDeferredTexture(url, { pin });
      };
    },
    [isActive, pin, url, colorSpace]
  );
  const getSnapshot = useCallback(() => getDeferredTextureSnapshot(url), [url]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  void dependencies;
  return snapshot;
};
