import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitalEngine } from "./engine";
import { keplerProvider } from "./keplerProvider";
import { initializeOrbitalEngine } from "./setup";
import type { OrbitalProvider } from "./types";

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

  it("clears cached positions when a provider is registered or replaced", () => {
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().size).toBe(1);

    const provider: OrbitalProvider = {
      id: "test-provider",
      name: "Test provider",
      model: "Kepler",
      timeScale: "TDB",
      outputFrame: "J2000_ECLIPTIC",
      supportedBodies: [],
      canCalculate: () => false,
      calculatePosition: (context) => ({
        position: new THREE.Vector3(),
        distanceAU: 0,
        provenance: "test",
        model: "Kepler",
        isFallback: false,
        jdTDB: context.jdTDB,
      }),
    };

    engine.registerProvider(provider);
    expect(engine.getCacheStats().size).toBe(0);
  });

  it("invalidates only the body whose Keplerian elements changed", () => {
    const bodyId = "cache-invalidation-test-body";
    const baseElements = {
      a: 1,
      e: 0,
      i: 0,
      O: 0,
      w: 0,
      M0: 0,
      n: 1,
    };

    engine.registerBodyElements(bodyId, baseElements);
    const first = engine.calculatePosition(bodyId, date);
    engine.calculatePosition("earth", date);
    expect(engine.getCacheStats().size).toBe(2);

    engine.registerBodyElements(bodyId, {
      ...baseElements,
      M0: 90,
    });

    const survivingKeys = engine.getCacheEntries().map(({ key }) => key);
    expect(survivingKeys).toHaveLength(1);
    expect(survivingKeys[0]).toMatch(/^earth@/);

    const second = engine.calculatePosition(bodyId, date);
    expect(second.position.distanceTo(first.position)).toBeGreaterThan(1);
    expect(engine.getCacheStats().size).toBe(2);
  });
});

describe("OrbitalEngine cache bound (time-warp leak guard)", () => {
  it("evicts oldest entries so the cache cannot grow without bound", () => {
    const engine = new OrbitalEngine();
    const base = Date.UTC(2025, 0, 1, 0, 0, 0, 0);
    // Each call advances simulated time well past the ~0.864 s cache
    // bucket, so every call is a distinct key — the exact pattern that
    // made the Map grow unbounded under fast-forward playback.
    for (let i = 0; i < 2500; i++) {
      engine.calculatePosition("earth", new Date(base + i * 3_600_000));
    }
    const { size } = engine.getCacheStats();
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(2000);
  });
});

describe("OrbitalEngine.getOsculatingElements validity gating", () => {
  it("falls back to Kepler outside the analytical validity range, matching the position provider", () => {
    // Seed the singleton keplerProvider's element database so the
    // out-of-validity fallback path exists (idempotent).
    initializeOrbitalEngine();
    const engine = new OrbitalEngine();
    // Ceres' asteroid-osculating theory is valid 2000–2050; 1890 is
    // outside it, where the position drops to the Kepler fallback.
    const outOfRange = new Date("1890-01-01T00:00:00Z");

    // Position drops to the Kepler fallback at this date.
    expect(engine.getProvenance("ceres", outOfRange).isFallback).toBe(true);

    // The orbit-line osculating elements must follow the SAME provider
    // selection — not silently keep using out-of-validity analytical
    // theory while the body marker is on the Kepler fallback.
    const viaEngine = engine.getOsculatingElements("ceres", outOfRange);
    const viaKepler = keplerProvider.getOsculatingElements("ceres", outOfRange);
    expect(viaEngine).toEqual(viaKepler);

    // Sanity: inside the window the analytical provider IS used, so the
    // elements differ from the Kepler fallback.
    const inRange = new Date("2025-01-01T00:00:00Z");
    const analytic = engine.getOsculatingElements("ceres", inRange);
    const kepler = keplerProvider.getOsculatingElements("ceres", inRange);
    expect(analytic).not.toEqual(kepler);
  });
});
