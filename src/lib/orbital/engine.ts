/**
 * Orbital Engine
 *
 * Central engine for calculating orbital positions with:
 * - Provider selection based on body metadata
 * - Position caching per tick
 * - Fallback chain management
 * - Provenance tracking
 */

import * as THREE from "three";
import type {
  OrbitalProvider,
  OrbitalCalculationContext,
  OrbitalPositionResult,
  PositionCacheEntry,
  OrbitalEngineConfig,
  BodyOrbitalMetadata,
  OsculatingElements,
} from "./types";
import { DEFAULT_ENGINE_CONFIG } from "./types";
import { dateToTDB } from "./time";
import { getOrbitalMetadata, isWithinValidityRange } from "./registry";
import { keplerProvider, registerKeplerBody } from "./keplerProvider";
import { analyticalProvider } from "./analyticalProvider";

/**
 * Cache key for position cache
 */
function getCacheKey(bodyId: string, jdTDB: number): string {
  // Round to ~1 second precision for cache efficiency
  const roundedJD = Math.round(jdTDB * 100000) / 100000;
  return `${bodyId}@${roundedJD.toFixed(5)}`;
}

/**
 * Hard cap on the position cache. The key quantizes jdTDB to a
 * ~0.864 s bucket, so steady playback at 1× reuses entries — but
 * under time-warp every frame advances the simulated clock past the
 * bucket, producing a unique key per frame. Without a bound the Map
 * would grow without limit (one of the primary features turns the
 * cache into a leak). Evicting the oldest insertion (Map preserves
 * insertion order) bounds growth while keeping recent times hot.
 * ~30 visible bodies × a generous time window fits comfortably.
 */
const MAX_POSITION_CACHE_ENTRIES = 2000;

/**
 * Orbital Engine
 *
 * Manages orbital position calculations with caching and provider selection.
 */
export class OrbitalEngine {
  private providers: Map<string, OrbitalProvider> = new Map();
  private positionCache: Map<string, PositionCacheEntry> = new Map();
  private config: OrbitalEngineConfig;

  // Cache instrumentation. `cacheHits` + `cacheMisses` sum to every
  // cacheable `calculatePosition` call (i.e. everything that isn't the
  // Sun special case). Sun calls are counted separately in
  // `cacheBypassed` since they never touch the cache. `resetCacheStats`
  // is expected to be called by a debug reporter once per measurement
  // window so the numbers reflect a known time slice rather than
  // session-cumulative totals.
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheBypassed = 0;

  constructor(config: Partial<OrbitalEngineConfig> = {}) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };

    // Register default providers
    this.registerProvider(keplerProvider);
    this.registerProvider(analyticalProvider);
  }

  /**
   * Register an orbital provider
   */
  registerProvider(provider: OrbitalProvider): void {
    this.providers.set(provider.id, provider);
    // A replacement provider may return a different result for every body it
    // supports. Registrations are rare control-plane operations, so clearing
    // the bounded cache is safer than retaining values produced by the old
    // implementation.
    this.clearCache();
  }

  /**
   * Get a registered provider
   */
  getProvider(id: string): OrbitalProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Register Keplerian elements for a body
   */
  registerBodyElements(
    bodyId: string,
    elements: {
      a: number;
      e: number;
      i: number;
      O: number;
      w: number;
      M0: number;
      n: number;
    }
  ): void {
    registerKeplerBody(bodyId, elements);
    this.clearBodyCache(bodyId);
  }

  private clearBodyCache(bodyId: string): void {
    const prefix = `${bodyId}@`;
    for (const cacheKey of this.positionCache.keys()) {
      if (cacheKey.startsWith(prefix)) {
        this.positionCache.delete(cacheKey);
      }
    }
  }

  /**
   * Select the best provider for a body
   */
  private selectProvider(
    bodyId: string,
    date: Date
  ): { provider: OrbitalProvider; isFallback: boolean } | null {
    const metadata = getOrbitalMetadata(bodyId);

    // If no metadata, try Kepler provider directly
    if (!metadata) {
      if (keplerProvider.canCalculate(bodyId)) {
        return { provider: keplerProvider, isFallback: true };
      }
      return null;
    }

    // Check if primary model is within validity range
    const inValidityRange = isWithinValidityRange(bodyId, date);

    if (inValidityRange && metadata.primaryProvider !== "kepler") {
      // Try primary provider (analytical ephemeris)
      const primary = this.providers.get(metadata.primaryProvider);
      if (primary && primary.canCalculate(bodyId)) {
        return { provider: primary, isFallback: false };
      }
    }

    // Fall back to Kepler provider
    if (keplerProvider.canCalculate(bodyId)) {
      if (this.config.logFallbacks && metadata.primaryModel !== "Kepler") {
        console.warn(
          `[OrbitalEngine] Using Kepler fallback for ${bodyId} ` +
            `(outside ${metadata.primaryModel} validity range)`
        );
      }
      return { provider: keplerProvider, isFallback: true };
    }

    return null;
  }

  /**
   * Calculate orbital position for a body
   */
  calculatePosition(
    bodyId: string,
    date: Date,
    parentId?: string
  ): OrbitalPositionResult {
    // Special case: Sun is the center of the system
    if (bodyId === "sun") {
      this.cacheBypassed++;
      return {
        position: new THREE.Vector3(0, 0, 0),
        distanceAU: 0,
        provenance: "Solar System Barycenter",
        model: "Kepler",
        isFallback: false,
        jdTDB: dateToTDB(date),
      };
    }

    const jdTDB = dateToTDB(date);

    // Check cache
    if (this.config.enableCache) {
      const cacheKey = getCacheKey(bodyId, jdTDB);
      const cached = this.positionCache.get(cacheKey);

      if (cached) {
        const age = Date.now() - cached.timestamp;
        if (age < this.config.cacheTtlMs) {
          this.cacheHits++;
          return cached.result;
        }
      }
      this.cacheMisses++;
    }

    // Select provider
    const selection = this.selectProvider(bodyId, date);
    if (!selection) {
      throw new Error(`No orbital provider available for body: ${bodyId}`);
    }

    const { provider, isFallback } = selection;

    // Build context
    const context: OrbitalCalculationContext = {
      bodyId,
      parentId,
      date,
      jdTDB,
    };

    // Calculate position
    const result = provider.calculatePosition(context);

    // Update fallback flag (preserve provider's value if already true)
    result.isFallback = result.isFallback || isFallback;

    // Cache result
    if (this.config.enableCache) {
      const cacheKey = getCacheKey(bodyId, jdTDB);
      this.positionCache.set(cacheKey, {
        result,
        jdTDB,
        timestamp: Date.now(),
      });
      // Bound the Map so time-warp playback (unique key per frame)
      // cannot grow it without limit. Evict oldest-inserted entries.
      while (this.positionCache.size > MAX_POSITION_CACHE_ENTRIES) {
        const oldest = this.positionCache.keys().next().value;
        if (oldest === undefined) break;
        this.positionCache.delete(oldest);
      }
    }

    return result;
  }

  /**
   * Calculate positions for multiple bodies at once
   */
  calculatePositions(
    bodies: Array<{ bodyId: string; parentId?: string }>,
    date: Date
  ): Map<string, OrbitalPositionResult> {
    const results = new Map<string, OrbitalPositionResult>();

    for (const { bodyId, parentId } of bodies) {
      try {
        const result = this.calculatePosition(bodyId, date, parentId);
        results.set(bodyId, result);
      } catch (error) {
        console.error(
          `[OrbitalEngine] Failed to calculate position for ${bodyId}:`,
          error
        );
      }
    }

    return results;
  }

  /**
   * Get osculating elements for a body
   */
  getOsculatingElements(bodyId: string, date: Date): OsculatingElements | null {
    const metadata = getOrbitalMetadata(bodyId);

    // Try the analytical provider ONLY when the date is inside its
    // advertised validity range — the same gate selectProvider() uses
    // for the position. Without this gate the orbit-line elements kept
    // using out-of-validity analytical theory while the body marker
    // dropped to the Kepler fallback, so the rendered ellipse and the
    // body's position disagreed at extreme dates.
    if (
      isWithinValidityRange(bodyId, date) &&
      metadata?.primaryProvider &&
      metadata.primaryProvider !== "kepler"
    ) {
      const provider = this.providers.get(metadata.primaryProvider);
      if (provider?.getOsculatingElements) {
        const elements = provider.getOsculatingElements(bodyId, date);
        if (elements) return elements;
      }
    }

    // Fall back to Kepler provider
    return keplerProvider.getOsculatingElements(bodyId, date);
  }

  /**
   * Get orbital metadata for a body
   */
  getBodyMetadata(bodyId: string): BodyOrbitalMetadata | null {
    return getOrbitalMetadata(bodyId);
  }

  /**
   * Get provenance information for a body
   */
  getProvenance(
    bodyId: string,
    date?: Date
  ): {
    model: string;
    provider: string;
    isFallback: boolean;
    plannedModel?: string;
    validityNote?: string;
  } {
    const checkDate = date || new Date();
    const metadata = getOrbitalMetadata(bodyId);

    if (bodyId === "sun") {
      return {
        model: "Solar System Barycenter",
        provider: "barycenter",
        isFallback: false,
      };
    }

    if (!metadata) {
      return {
        model: "Kepler",
        provider: "kepler",
        isFallback: true,
      };
    }

    const inValidityRange = isWithinValidityRange(bodyId, checkDate);
    const result = this.calculatePosition(bodyId, checkDate);
    const isFallback = result.isFallback;
    const plannedModel =
      metadata.primaryModel !== "Kepler" ? metadata.primaryModel : undefined;

    return {
      model: isFallback ? "Kepler" : result.model,
      provider: isFallback ? "kepler" : metadata.primaryProvider,
      isFallback,
      plannedModel: isFallback ? plannedModel : undefined,
      validityNote:
        metadata.validityRange && plannedModel && !inValidityRange
          ? `Valid ${metadata.validityRange.startYear}-${metadata.validityRange.endYear}`
          : undefined,
    };
  }

  /**
   * Clear the position cache
   */
  clearCache(): void {
    this.positionCache.clear();
  }

  /**
   * Reset the hit/miss counters without touching cache contents. Call
   * this at the start of each measurement window so reported rates
   * reflect the last window, not session-cumulative totals.
   */
  resetCacheStats(): void {
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheBypassed = 0;
  }

  /**
   * Get cache statistics — cheap, counter-only snapshot.
   *
   * - `hits`, `misses`, `bypassed`: counters since the last
   *   `resetCacheStats()` (or since instance creation). `hitRate` is
   *   computed over cacheable calls only; bypassed calls (currently
   *   just the Sun special case) are reported separately.
   * - `size`: TOTAL number of entries in the internal `Map`, NOT a
   *   count of "live" (non-expired) entries. The cache only evicts
   *   lazily on a read that hits an expired entry (and even then only
   *   replaces that one entry), so `size` grows monotonically with
   *   the number of distinct (bodyId, quantizedJD) buckets the app
   *   has ever queried. For long sessions this is a known limitation
   *   — a proper TTL sweep / LRU policy is tracked as follow-up work.
   *
   * O(1) to call. For the expanded entries listing (key + age per
   * live entry), use `getCacheEntries()` — that one is O(n) and was
   * split out of `getCacheStats()` on 2026-04-18 after a Codex
   * finding that the reporter was paying for it every second even
   * though it only consumed the counters.
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    bypassed: number;
    hitRate: number;
  } {
    const totalCacheable = this.cacheHits + this.cacheMisses;
    const hitRate = totalCacheable === 0 ? 0 : this.cacheHits / totalCacheable;

    return {
      size: this.positionCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      bypassed: this.cacheBypassed,
      hitRate,
    };
  }

  /**
   * Snapshot of the cache entries with their ages in milliseconds.
   * O(n) — only call from debug tooling, not from a render loop.
   */
  getCacheEntries(): Array<{ key: string; age: number }> {
    const now = Date.now();
    return Array.from(this.positionCache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
    }));
  }

  /**
   * Pre-calculate positions for a set of bodies
   * Useful for warming up the cache
   */
  preCalculate(bodyIds: string[], dates: Date[]): void {
    for (const date of dates) {
      for (const bodyId of bodyIds) {
        try {
          this.calculatePosition(bodyId, date);
        } catch {
          // Ignore errors during pre-calculation
        }
      }
    }
  }
}

/**
 * Singleton instance of the orbital engine
 */
export const orbitalEngine = new OrbitalEngine();

/**
 * Convenience function to calculate position
 */
export function calculateOrbitalPosition(
  bodyId: string,
  date: Date,
  parentId?: string
): OrbitalPositionResult {
  return orbitalEngine.calculatePosition(bodyId, date, parentId);
}

/**
 * Convenience function to get provenance
 */
export function getOrbitalProvenance(
  bodyId: string,
  date?: Date
): ReturnType<OrbitalEngine["getProvenance"]> {
  return orbitalEngine.getProvenance(bodyId, date);
}
