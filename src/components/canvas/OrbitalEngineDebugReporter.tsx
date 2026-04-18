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
 * - `size`: TOTAL number of entries in the engine's internal `Map`
 *   at sampling time. This is NOT a live-entry count: the cache only
 *   evicts lazily on a read that hits an expired entry (and only the
 *   single offending entry, not a broader sweep). In a long idle
 *   session `size` grows monotonically by ~bodies × new-buckets-per-
 *   second. That growth is bounded by the 0.864 s bucket width but
 *   is not self-limiting — a proper TTL sweep / LRU is tracked as
 *   follow-up work.
 */

import { useEffect } from "react";
import { useStore } from "../../store";
import { orbitalEngine } from "../../lib/orbital";
import { telemetry } from "../../lib/telemetry";

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
      telemetry.info(
        "perf",
        `orbital-engine hitRate=${pct}% (hits=${stats.hits} miss=${stats.misses} bypass=${stats.bypassed}) size=${stats.size}`
      );
      orbitalEngine.resetCacheStats();
    }, REPORT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [debugMode]);

  return null;
};
