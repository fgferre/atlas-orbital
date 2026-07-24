import { useEffect, useState } from "react";
import {
  useDeferredTexture,
  type UseDeferredTextureOptions,
} from "./useDeferredTexture";

/**
 * Keeps the last ready tier acquired while a replacement is loading.
 *
 * A direct URL switch makes `useDeferredTexture` correctly release the old
 * cache entry, but the new snapshot starts empty. Without this hand-off the
 * planet briefly falls back to a procedural surface between 2K and 8K.
 */
export const useProgressiveDeferredTexture = (
  url?: string | null,
  options: UseDeferredTextureOptions = {}
) => {
  const enabled = options.enabled ?? true;
  const desired = useDeferredTexture(url, options);
  const [retainedUrl, setRetainedUrl] = useState<string | null>(null);
  const retained = useDeferredTexture(retainedUrl, {
    ...options,
    enabled: enabled && Boolean(retainedUrl) && retainedUrl !== url,
  });

  useEffect(() => {
    if (!enabled || !url || desired.status !== "ready" || !desired.texture) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setRetainedUrl((current) => (current === url ? current : url));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [desired.status, desired.texture, enabled, url]);

  return {
    ...desired,
    texture: desired.texture ?? retained.texture,
    retainedUrl: desired.texture || !retained.texture ? null : retainedUrl,
  };
};
