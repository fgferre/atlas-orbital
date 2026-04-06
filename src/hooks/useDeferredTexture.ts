import { useCallback, useSyncExternalStore } from "react";
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
}

export const useDeferredTexture = (
  url?: string | null,
  options: UseDeferredTextureOptions = {}
) => {
  const {
    enabled = true,
    pin = false,
    dependencies = EMPTY_DEPENDENCIES,
  } = options;
  const isActive = Boolean(url) && enabled;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!url || !isActive) {
        return () => {};
      }

      acquireDeferredTexture(url, { pin });
      const unsubscribe = subscribeToDeferredTexture(url, notify);

      return () => {
        unsubscribe();
        releaseDeferredTexture(url, { pin });
      };
    },
    [isActive, pin, url]
  );
  const getSnapshot = useCallback(() => getDeferredTextureSnapshot(url), [url]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  void dependencies;
  return snapshot;
};
