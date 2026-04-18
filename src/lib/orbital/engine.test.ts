import { beforeEach, describe, expect, it } from "vitest";
import { OrbitalEngine } from "./engine";

describe("OrbitalEngine cache stats", () => {
  let engine: OrbitalEngine;
  const date = new Date("2025-01-01T00:00:00Z");

  beforeEach(() => {
    engine = new OrbitalEngine();
  });

  it("starts with zero counters and zero size", () => {
    const stats = engine.getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.bypassed).toBe(0);
    expect(stats.size).toBe(0);
    expect(stats.hitRate).toBe(0);
  });

  it("counts the first call as miss and the repeat as hit", () => {
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().misses).toBe(1);
    expect(engine.getCacheStats().hits).toBe(0);

    engine.calculatePosition("earth", date);
    const stats = engine.getCacheStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
    expect(stats.size).toBe(1);
  });

  it("bypasses the cache for the Sun special case", () => {
    engine.calculatePosition("sun", date);
    engine.calculatePosition("sun", date);
    const stats = engine.getCacheStats();
    expect(stats.bypassed).toBe(2);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
    // hitRate is over cacheable calls only, so bypassed calls must
    // not poison it — zero denominator → zero rate.
    expect(stats.hitRate).toBe(0);
  });

  it("hitRate excludes bypassed calls from the denominator", () => {
    engine.calculatePosition("sun", date);
    engine.calculatePosition("sun", date);
    engine.calculatePosition("earth", date);
    engine.calculatePosition("earth", date);
    const stats = engine.getCacheStats();
    expect(stats.bypassed).toBe(2);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    // 1 / (1 + 1) = 0.5; never 1 / (1 + 1 + 2) = 0.25.
    expect(stats.hitRate).toBeCloseTo(0.5);
  });

  it("resetCacheStats() clears counters but keeps cache entries", () => {
    engine.calculatePosition("earth", date);
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().size).toBe(1);
    expect(engine.getCacheStats().hits).toBe(1);

    engine.resetCacheStats();
    const after = engine.getCacheStats();
    expect(after.hits).toBe(0);
    expect(after.misses).toBe(0);
    expect(after.bypassed).toBe(0);
    // The cache map itself is untouched — only the counters reset.
    expect(after.size).toBe(1);

    // And that surviving entry still serves hits on the next query.
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().hits).toBe(1);
    expect(engine.getCacheStats().misses).toBe(0);
  });

  it("clearCache() empties the cache but preserves counters", () => {
    engine.calculatePosition("earth", date);
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().size).toBe(1);

    engine.clearCache();
    const after = engine.getCacheStats();
    expect(after.size).toBe(0);
    // Counters are the observability path and belong to a different
    // concern than cache contents — clearCache must not zero them.
    expect(after.hits).toBe(1);
    expect(after.misses).toBe(1);
  });

  it("getCacheEntries() returns (key, age) pairs for each live entry", () => {
    engine.calculatePosition("earth", date);
    engine.calculatePosition("mars", date);
    const entries = engine.getCacheEntries();
    expect(entries.length).toBe(2);
    expect(entries.some((e) => e.key.startsWith("earth@"))).toBe(true);
    expect(entries.some((e) => e.key.startsWith("mars@"))).toBe(true);
    for (const e of entries) {
      expect(e.age).toBeGreaterThanOrEqual(0);
      expect(e.age).toBeLessThan(1000);
    }
  });

  it("separate bodies produce separate cache keys (hits per body)", () => {
    engine.calculatePosition("earth", date);
    engine.calculatePosition("mars", date);
    expect(engine.getCacheStats().misses).toBe(2);
    expect(engine.getCacheStats().hits).toBe(0);

    engine.calculatePosition("earth", date);
    engine.calculatePosition("mars", date);
    expect(engine.getCacheStats().hits).toBe(2);
    expect(engine.getCacheStats().misses).toBe(2);
  });
});
