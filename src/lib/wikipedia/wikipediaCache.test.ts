/**
 * Tests for the IndexedDB-backed Wikipedia summary cache.
 *
 * Uses `fake-indexeddb` to provide an in-memory DOM-IndexedDB
 * shim — no real browser environment needed. Each test gets a
 * unique `dbName` so concurrent test files don't share state
 * across the worker.
 */

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWikipediaCache,
  type WikipediaCache,
  type WikipediaCacheEntry,
} from "./wikipediaCache";
import type { WikipediaSummary } from "./wikipediaClient";

const buildSummary = (title: string, lang = "en"): WikipediaSummary => ({
  title,
  extract: `Extract for ${title}.`,
  thumbnailUrl: null,
  pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  language: lang,
});

let cache: WikipediaCache;
let testCounter = 0;

const buildCache = (
  overrides: Parameters<typeof createWikipediaCache>[0] = {}
) =>
  createWikipediaCache({
    dbName: `wikipediaCacheTest_${Date.now()}_${++testCounter}`,
    storeName: "summaries",
    ttlMs: 30 * 24 * 60 * 60 * 1000,
    maxEntries: 200,
    ...overrides,
  });

describe("createWikipediaCache — round-trip", () => {
  beforeEach(() => {
    cache = buildCache();
  });

  afterEach(async () => {
    await cache.close();
  });

  it("returns null for keys that have never been written", async () => {
    expect(await cache.get("Sirius", "en")).toBeNull();
  });

  it("round-trips a written summary by (title, lang)", async () => {
    const summary = buildSummary("Sirius");
    await cache.set("Sirius", "en", summary);
    const entry = await cache.get("Sirius", "en");
    expect(entry).not.toBeNull();
    expect(entry?.summary).toEqual(summary);
    expect(typeof entry?.fetchedAt).toBe("number");
  });

  it("scopes entries by language (Sirius/en and Sirius/pt are separate)", async () => {
    await cache.set("Sirius", "en", buildSummary("Sirius", "en"));
    await cache.set("Sirius", "pt", buildSummary("Sírio", "pt"));
    const en = await cache.get("Sirius", "en");
    const pt = await cache.get("Sirius", "pt");
    expect(en?.summary.title).toBe("Sirius");
    expect(en?.summary.language).toBe("en");
    expect(pt?.summary.title).toBe("Sírio");
    expect(pt?.summary.language).toBe("pt");
  });

  it("overwrites the existing entry when set is called twice for the same key", async () => {
    await cache.set("Sirius", "en", {
      ...buildSummary("Sirius"),
      extract: "v1",
    });
    await cache.set("Sirius", "en", {
      ...buildSummary("Sirius"),
      extract: "v2",
    });
    const entry = await cache.get("Sirius", "en");
    expect(entry?.summary.extract).toBe("v2");
  });

  it("clear() removes every entry", async () => {
    await cache.set("Sirius", "en", buildSummary("Sirius"));
    await cache.set("Vega", "en", buildSummary("Vega"));
    await cache.clear();
    expect(await cache.get("Sirius", "en")).toBeNull();
    expect(await cache.get("Vega", "en")).toBeNull();
  });
});

describe("createWikipediaCache — TTL", () => {
  let nowImpl: () => number;
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1_700_000_000_000; // arbitrary epoch ms
    nowImpl = () => mockTime;
    cache = buildCache({ nowImpl, ttlMs: 1000 });
  });

  afterEach(async () => {
    await cache.close();
  });

  it("returns the entry when the elapsed time is within TTL", async () => {
    await cache.set("Sirius", "en", buildSummary("Sirius"));
    mockTime += 999;
    const entry = await cache.get("Sirius", "en");
    expect(entry).not.toBeNull();
  });

  it("returns null when the elapsed time exceeds TTL (stale → re-fetch)", async () => {
    await cache.set("Sirius", "en", buildSummary("Sirius"));
    mockTime += 1001;
    expect(await cache.get("Sirius", "en")).toBeNull();
  });

  it("a re-set after staleness refreshes fetchedAt and re-enables get()", async () => {
    await cache.set("Sirius", "en", buildSummary("Sirius"));
    mockTime += 5000; // long past TTL
    expect(await cache.get("Sirius", "en")).toBeNull();
    await cache.set("Sirius", "en", buildSummary("Sirius"));
    const entry = await cache.get("Sirius", "en");
    expect(entry).not.toBeNull();
    expect(entry?.fetchedAt).toBe(mockTime);
  });
});

describe("createWikipediaCache — LRU eviction", () => {
  let nowImpl: () => number;
  let mockTime: number;

  beforeEach(() => {
    mockTime = 1_700_000_000_000;
    nowImpl = () => mockTime;
    cache = buildCache({ nowImpl, maxEntries: 3 });
  });

  afterEach(async () => {
    await cache.close();
  });

  it("retains all entries when count is at or below maxEntries", async () => {
    for (let i = 0; i < 3; i++) {
      mockTime += 10;
      await cache.set(`Star${i}`, "en", buildSummary(`Star${i}`));
    }
    for (let i = 0; i < 3; i++) {
      const entry = await cache.get(`Star${i}`, "en");
      expect(entry).not.toBeNull();
    }
  });

  it("evicts the oldest entry on the next insertion past the cap", async () => {
    mockTime = 1000;
    await cache.set("Oldest", "en", buildSummary("Oldest"));
    mockTime = 2000;
    await cache.set("Older", "en", buildSummary("Older"));
    mockTime = 3000;
    await cache.set("Recent", "en", buildSummary("Recent"));
    mockTime = 4000;
    await cache.set("Newest", "en", buildSummary("Newest"));

    expect(await cache.get("Oldest", "en")).toBeNull();
    expect(await cache.get("Older", "en")).not.toBeNull();
    expect(await cache.get("Recent", "en")).not.toBeNull();
    expect(await cache.get("Newest", "en")).not.toBeNull();
  });

  it("re-setting an entry refreshes its fetchedAt and saves it from eviction", async () => {
    mockTime = 1000;
    await cache.set("StaleA", "en", buildSummary("StaleA"));
    mockTime = 2000;
    await cache.set("StaleB", "en", buildSummary("StaleB"));
    mockTime = 3000;
    await cache.set("StaleC", "en", buildSummary("StaleC"));
    // Re-set StaleA at a fresh timestamp — it's now the newest.
    mockTime = 4000;
    await cache.set("StaleA", "en", buildSummary("StaleA"));
    // Insert one more — evicts StaleB (the oldest after the refresh).
    mockTime = 5000;
    await cache.set("StaleD", "en", buildSummary("StaleD"));

    expect(await cache.get("StaleB", "en")).toBeNull();
    expect(await cache.get("StaleA", "en")).not.toBeNull();
    expect(await cache.get("StaleC", "en")).not.toBeNull();
    expect(await cache.get("StaleD", "en")).not.toBeNull();
  });

  it("evicts multiple entries in one set when the count is over by more than one", async () => {
    // Pre-seed 5 entries (over a 3-cap by 2). Each set call sweeps
    // until count <= maxEntries, so the final state has exactly 3.
    for (let i = 0; i < 5; i++) {
      mockTime = 1000 + i * 100;
      await cache.set(`Star${i}`, "en", buildSummary(`Star${i}`));
    }
    // Star0, Star1 should be evicted (oldest two); Star2/3/4 remain.
    expect(await cache.get("Star0", "en")).toBeNull();
    expect(await cache.get("Star1", "en")).toBeNull();
    expect(await cache.get("Star2", "en")).not.toBeNull();
    expect(await cache.get("Star3", "en")).not.toBeNull();
    expect(await cache.get("Star4", "en")).not.toBeNull();
  });
});

describe("WikipediaCacheEntry shape", () => {
  beforeEach(() => {
    cache = buildCache();
  });

  afterEach(async () => {
    await cache.close();
  });

  it("entry.fetchedAt reflects the configured clock at write time", async () => {
    const fixed = 1_700_000_000_000;
    const fixedCache = buildCache({ nowImpl: () => fixed });
    await fixedCache.set("Sirius", "en", buildSummary("Sirius"));
    const entry = await fixedCache.get("Sirius", "en");
    expect(entry?.fetchedAt).toBe(fixed);
    await fixedCache.close();
  });

  it("preserves the WikipediaSummary structure verbatim", async () => {
    const summary: WikipediaSummary = {
      title: "Sirius",
      extract: "Extract.",
      thumbnailUrl: "https://upload.wikimedia.org/sirius.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Sirius",
      language: "en",
    };
    await cache.set("Sirius", "en", summary);
    const entry = (await cache.get("Sirius", "en")) as WikipediaCacheEntry;
    expect(entry.summary).toEqual(summary);
  });
});
