import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDedupedStorage,
  deriveGraphicsFieldsFromQualityMode,
  LEGACY_QUALITY_MODE_KEY,
  LEGACY_SUN_RENDER_MODE_KEY,
  LEGACY_TUTORIAL_STATUS_KEY,
  migrate,
  migrateLegacyStorage,
  PERSIST_KEY,
  PERSIST_VERSION,
} from "./store.persistMigration";
import type { QualityMode } from "./lib/qualityProfile";

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

  it("seeds the unified envelope from legacy keys on first migration (writes as v0 so Zustand's migrate() runs on rehydration)", () => {
    storage.setItem(LEGACY_QUALITY_MODE_KEY, "ultra");
    storage.setItem(LEGACY_SUN_RENDER_MODE_KEY, "procedural");
    storage.setItem(LEGACY_TUTORIAL_STATUS_KEY, "completed");

    const migrated = migrateLegacyStorage(storage);
    expect(migrated).toBe(true);

    const envelope = JSON.parse(storage.getItem(PERSIST_KEY) ?? "null");
    // MUST be version 0 — Zustand's migrate() runs on rehydration to
    // derive the Wave α graphics + accessibility fields from
    // qualityMode. Tagging the envelope as the current PERSIST_VERSION
    // here would skip that derivation and silently lose the user's
    // qualityMode preference.
    expect(envelope).toEqual({
      state: {
        qualityMode: "ultra",
        sunRenderMode: "procedural",
        tutorialCompletionStatus: "completed",
      },
      version: 0,
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

describe("deriveGraphicsFieldsFromQualityMode — Wave α Commit 3 v0→v1", () => {
  it.each([
    [
      "ultra",
      { graphicsPreset: "ultra", graphicsAutoMode: false, customBase: "ultra" },
    ],
    [
      "high",
      { graphicsPreset: "high", graphicsAutoMode: false, customBase: "high" },
    ],
    [
      "balanced",
      {
        graphicsPreset: "medium",
        graphicsAutoMode: false,
        customBase: "medium",
      },
    ],
    [
      "constrained",
      { graphicsPreset: "low", graphicsAutoMode: false, customBase: "low" },
    ],
    [
      "auto",
      { graphicsPreset: "high", graphicsAutoMode: true, customBase: "high" },
    ],
  ] as const)("qualityMode %s → %o", (mode, expected) => {
    expect(deriveGraphicsFieldsFromQualityMode(mode as QualityMode)).toEqual(
      expected
    );
  });

  it("undefined / unknown qualityMode falls back to auto (corrupted-envelope safety)", () => {
    expect(deriveGraphicsFieldsFromQualityMode(undefined)).toEqual({
      graphicsPreset: "high",
      graphicsAutoMode: true,
      customBase: "high",
    });
    expect(deriveGraphicsFieldsFromQualityMode(null)).toEqual({
      graphicsPreset: "high",
      graphicsAutoMode: true,
      customBase: "high",
    });
  });
});

describe("migrate — v0 → v1", () => {
  // Zustand's persist middleware calls this on rehydration when the
  // stored envelope version is less than PERSIST_VERSION. The Wave α
  // contract: every existing user's qualityMode preference maps to the
  // correct (graphicsPreset, graphicsAutoMode, customBase) triple, and
  // sunRenderMode / tutorialCompletionStatus pass through unchanged.

  it.each([
    [
      "auto",
      { graphicsPreset: "high", graphicsAutoMode: true, customBase: "high" },
    ],
    [
      "ultra",
      { graphicsPreset: "ultra", graphicsAutoMode: false, customBase: "ultra" },
    ],
    [
      "high",
      { graphicsPreset: "high", graphicsAutoMode: false, customBase: "high" },
    ],
    [
      "balanced",
      {
        graphicsPreset: "medium",
        graphicsAutoMode: false,
        customBase: "medium",
      },
    ],
    [
      "constrained",
      { graphicsPreset: "low", graphicsAutoMode: false, customBase: "low" },
    ],
  ] as const)(
    "qualityMode=%s migrates to the matching graphics triple",
    (mode, expected) => {
      const v0 = {
        qualityMode: mode as QualityMode,
        sunRenderMode: "auto" as const,
        tutorialCompletionStatus: "completed" as const,
      };
      const v1 = migrate(v0, 0);
      expect(v1.graphicsPreset).toBe(expected.graphicsPreset);
      expect(v1.graphicsAutoMode).toBe(expected.graphicsAutoMode);
      expect(v1.customBase).toBe(expected.customBase);
      expect(v1.qualityMode).toBe(mode);
    }
  );

  it("preserves sunRenderMode untouched across v0 → v1", () => {
    for (const sunMode of ["auto", "texture", "procedural"] as const) {
      const v1 = migrate(
        {
          qualityMode: "high",
          sunRenderMode: sunMode,
          tutorialCompletionStatus: "completed",
        },
        0
      );
      expect(v1.sunRenderMode).toBe(sunMode);
    }
  });

  it("preserves tutorialCompletionStatus untouched across v0 → v1", () => {
    for (const status of ["not-seen", "skipped", "completed", null] as const) {
      const v1 = migrate(
        {
          qualityMode: "high",
          sunRenderMode: "auto",
          tutorialCompletionStatus: status,
        },
        0
      );
      expect(v1.tutorialCompletionStatus).toBe(status);
    }
  });

  it("seeds graphicsOverrides as an empty record", () => {
    const v1 = migrate({ qualityMode: "high", sunRenderMode: "auto" }, 0);
    expect(v1.graphicsOverrides).toEqual({});
  });

  it("seeds a valid accessibility default (handles missing matchMedia gracefully)", () => {
    const v1 = migrate({ qualityMode: "high", sunRenderMode: "auto" }, 0);
    expect(v1.accessibility).toEqual(
      expect.objectContaining({
        uiScale: 1,
        colorblindMode: "none",
        highContrast: false,
      })
    );
    expect(typeof v1.accessibility.reducedMotion).toBe("boolean");
  });

  it("handles a completely empty v0 envelope by defaulting to auto-detect", () => {
    const v1 = migrate({}, 0);
    expect(v1.qualityMode).toBe("auto");
    expect(v1.graphicsAutoMode).toBe(true);
    expect(v1.graphicsPreset).toBe("high");
    expect(v1.sunRenderMode).toBe("auto");
    expect(v1.tutorialCompletionStatus).toBe(null);
  });

  it("handles an unknown qualityMode string without crashing (defaults to auto)", () => {
    const v1 = migrate(
      { qualityMode: "bogus" as QualityMode, sunRenderMode: "auto" },
      0
    );
    expect(v1.graphicsAutoMode).toBe(true);
    expect(v1.graphicsPreset).toBe("high");
    expect(v1.qualityMode).toBe("auto");
  });
});

describe("migrate — v1 forward path", () => {
  it("passes a well-formed v1 envelope through unchanged", () => {
    const v1in = {
      qualityMode: "ultra" as const,
      sunRenderMode: "procedural" as const,
      tutorialCompletionStatus: "completed" as const,
      graphicsPreset: "ultra" as const,
      graphicsAutoMode: false,
      graphicsOverrides: { bloomIntensityMul: 1.5 },
      customBase: "ultra" as const,
      accessibility: {
        reducedMotion: true,
        uiScale: 1.2,
        colorblindMode: "none" as const,
        highContrast: false,
      },
      wikipediaIntegrationEnabled: false,
    };
    const out = migrate(v1in, 1);
    expect(out).toEqual(v1in);
  });

  it("coerces a partial v1 envelope by filling missing fields from defaults", () => {
    const v1partial = { qualityMode: "high" as const };
    const out = migrate(v1partial, 1);
    expect(out.qualityMode).toBe("high");
    expect(out.sunRenderMode).toBe("auto");
    expect(out.graphicsPreset).toBe("high");
    expect(out.graphicsOverrides).toEqual({});
    // M6-G: missing field defaults to ON (Wikipedia integration is
    // a feature you have to opt OUT of, not opt IN to).
    expect(out.wikipediaIntegrationEnabled).toBe(true);
  });

  it("preserves explicit wikipediaIntegrationEnabled=false in v1 envelope (M6-G)", () => {
    const v1in = {
      qualityMode: "high" as const,
      wikipediaIntegrationEnabled: false,
    };
    const out = migrate(v1in, 1);
    expect(out.wikipediaIntegrationEnabled).toBe(false);
  });
});
