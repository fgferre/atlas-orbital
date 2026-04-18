/**
 * OrbitalEngineDebugReporter
 *
 * Zero-visual component that, while `debugMode === true`, logs
 * `orbitalEngine` cache statistics to the console once per second and
 * resets the hit/miss counters so each line reflects the last 1 s of
 * cacheable calls. Mounted outside the R3F Canvas — it uses only
 * `useEffect`/`setInterval`, no Three.js state.
 *
 * Interpretation tips for the emitted line:
 *
 *   [orbital-engine] hitRate=98.2% (hits=2654 miss=49 bypass=60) size=91
 *
 * - `hits`, `miss`: cacheable calls resolved from cache vs. that fell
 *   through to a provider. `hitRate = hits / (hits + miss)`.
 * - `bypass`: calls that never touched the cache (currently just the
 *   Sun special case). Useful to sanity-check volume without
 *   polluting the hit rate.
 * - `size`: number of live entries in the cache map at sampling time
 *   (no TTL sweep — entries age out lazily on next read). Grows at
 *   ~bodies × new-buckets-per-second and self-limits because the
 *   engine keys bucket-quantized JDs.
 */

import { useEffect } from "react";
import { useStore } from "../../store";
import { orbitalEngine } from "../../lib/orbital";

const REPORT_INTERVAL_MS = 1000;

export const OrbitalEngineDebugReporter = () => {
  const debugMode = useStore((state) => state.debugMode);

  useEffect(() => {
    if (!debugMode) return;

    // Reset at start of the first window so the first line is already
    // representative instead of carrying stats from an earlier session.
    orbitalEngine.resetCacheStats();

    const intervalId = window.setInterval(() => {
      const stats = orbitalEngine.getCacheStats();
      const pct = (stats.hitRate * 100).toFixed(1);
      console.info(
        `[orbital-engine] hitRate=${pct}% (hits=${stats.hits} miss=${stats.misses} bypass=${stats.bypassed}) size=${stats.size}`
      );
      orbitalEngine.resetCacheStats();
    }, REPORT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [debugMode]);

  return null;
};
