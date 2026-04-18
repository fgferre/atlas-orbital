import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDedupedStorage,
  LEGACY_QUALITY_MODE_KEY,
  LEGACY_SUN_RENDER_MODE_KEY,
  LEGACY_TUTORIAL_STATUS_KEY,
  migrateLegacyStorage,
  PERSIST_KEY,
  PERSIST_VERSION,
} from "./store.persistMigration";

const createMockStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
};

describe("migrateLegacyStorage", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("returns false and is a no-op when no legacy keys exist", () => {
    const migrated = migrateLegacyStorage(storage);
    expect(migrated).toBe(false);
    expect(storage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("returns false and is a no-op when the unified key already exists", () => {
    const existing = JSON.stringify({
      state: { qualityMode: "high" },
      version: PERSIST_VERSION,
    });
    storage.setItem(PERSIST_KEY, existing);
    // Intentionally set a legacy key too to prove it's ignored when the
    // new envelope is already in place.
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "ultra");

    const migrated = migrateLegacyStorage(storage);
    expect(migrated).toBe(false);
    expect(storage.getItem(PERSIST_KEY)).toBe(existing);
  });

  it("seeds the unified envelope from legacy keys on first migration", () => {
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "ultra");
    storage.setItem(LEGACY_SUN_RENDER_MODE_KEY, "procedural");
    storage.setItem(LEGACY_TUTORIAL_STATUS_KEY, "completed");

    const migrated = migrateLegacyStorage(storage);
    expect(migrated).toBe(true);

    const envelope = JSON.parse(storage.getItem(PERSIST_KEY) ?? "null");
    expect(envelope).toEqual({
      state: {
        qualityMode: "ultra",
        sunRenderMode: "procedural",
        tutorialCompletionStatus: "completed",
      },
      version: PERSIST_VERSION,
    });
  });

  it("migrates partial legacy state without fabricating missing fields", () => {
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "balanced");
    // sun render mode and tutorial status intentionally absent

    migrateLegacyStorage(storage);
    const envelope = JSON.parse(storage.getItem(PERSIST_KEY) ?? "null");
    expect(envelope.state).toEqual({ qualityMode: "balanced" });
  });

  it("ignores legacy values that are outside the validated union", () => {
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "bogus");
    storage.setItem(LEGACY_SUN_RENDER_MODE_KEY, "also-bogus");
    storage.setItem(LEGACY_TUTORIAL_STATUS_KEY, "not-seen"); // not a legacy literal

    const migrated = migrateLegacyStorage(storage);
    expect(migrated).toBe(false);
    expect(storage.getItem(PERSIST_KEY)).toBeNull();
  });

  it("leaves legacy keys in place after migrating", () => {
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "ultra");
    migrateLegacyStorage(storage);
    expect(storage.getItem(LEGACY_QUALITY_MODE_KEY)).toBe("ultra");
  });
});

describe("createDedupedStorage", () => {
  it("forwards the first setItem and caches it", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("k", "v1");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("k", "v1");
  });

  it("skips a subsequent setItem when the value is byte-identical", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("k", "v1");
    storage.setItem("k", "v1");
    storage.setItem("k", "v1");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("forwards when the value changes", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("k", "v1");
    storage.setItem("k", "v2");
    storage.setItem("k", "v1"); // same as the most-recent cached value? no — last was v2
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("tracks dedupe cache per key", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("a", "x");
    storage.setItem("b", "x");
    storage.setItem("a", "x"); // deduped
    storage.setItem("b", "x"); // deduped
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("getItem pulls from the inner storage unchanged", () => {
    const inner = createMockStorage();
    inner.setItem("seed", "present");
    const storage = createDedupedStorage(inner);
    expect(storage.getItem("seed")).toBe("present");
    expect(storage.getItem("missing")).toBeNull();
  });

  it("removeItem forwards and clears the dedupe cache for that key", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("k", "v1");
    expect(spy).toHaveBeenCalledTimes(1);

    storage.removeItem("k");

    // After remove, the next write must go through even if it matches
    // the pre-remove value — the storage doesn't hold it anymore.
    storage.setItem("k", "v1");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("clear empties inner and drops all cached dedupe entries", () => {
    const inner = createMockStorage();
    const spy = vi.spyOn(inner, "setItem");
    const storage = createDedupedStorage(inner);

    storage.setItem("a", "x");
    storage.setItem("b", "y");
    storage.clear();
    expect(inner.length).toBe(0);

    storage.setItem("a", "x");
    storage.setItem("b", "y");
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
