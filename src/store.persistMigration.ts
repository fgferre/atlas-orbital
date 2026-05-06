/**
 * Persist-middleware support for the app store.
 *
 * Two concerns live here so they can be exercised directly by unit
 * tests without dragging in the rest of `store.ts` (which has
 * module-level side effects: it creates the Zustand store and wires
 * the simulationClock bridge):
 *
 * 1. `migrateLegacyStorage` — one-shot migration of the pre-persist
 *    per-key slots (`qualityMode`, `sunRenderMode`, `tutorialStatus`)
 *    into the unified envelope (`atlas-orbital-store`) that the
 *    persist middleware reads on boot.
 * 2. `createDedupedStorage` — thin wrapper around `Storage` that
 *    skips `setItem` when the value for a given key matches the last
 *    value it observed. Needed because Zustand 5's persist calls
 *    `storage.setItem(...)` after EVERY `set()`, regardless of whether
 *    `partialize`'s output changed. With the simulationClock bridge
 *    writing `displayedDatetime` at ~4 Hz (and overlay motion at up
 *    to 60 Hz), unconditional writes put a steady stream of
 *    synchronous `localStorage` traffic on the main thread for no
 *    change in the persisted slice. Catching that at the storage
 *    layer is the minimal surgical fix.
 */

import type { QualityMode } from "./lib/qualityProfile";
import type { SunRenderMode } from "./lib/sunRenderMode";
import {
  DEFAULT_GRAPHICS_STATE,
  getDefaultAccessibilityState,
  type AccessibilityState,
  type GraphicsBasePreset,
  type GraphicsOverrides,
  type GraphicsPresetName,
} from "./store/graphicsSlice";

export const PERSIST_KEY = "atlas-orbital-store";
/**
 * Persist envelope version.
 *
 * v0 → `{ qualityMode, sunRenderMode, tutorialCompletionStatus }`
 *      Pre-Wave-α envelope; covered by the pre-existing migration below.
 * v1 → adds `graphicsPreset`, `graphicsAutoMode`, `graphicsOverrides`,
 *      `customBase`, `accessibility`. Wave α Commit 3's R2 Wave 1 bumps
 *      here; the `migrate()` branch below derives the new fields from
 *      the v0 `qualityMode` so no user preference is lost across the
 *      upgrade.
 */
export const PERSIST_VERSION = 1;

export const LEGACY_QUALITY_MODE_KEY = "qualityMode";
export const LEGACY_SUN_RENDER_MODE_KEY = "sunRenderMode";
export const LEGACY_TUTORIAL_STATUS_KEY = "tutorialStatus";

export type LegacyTutorialStatus = "skipped" | "completed";

/**
 * Shape of the v1 persist envelope. `qualityMode` stays as a compat
 * read-path consumer until Wave 6 retires it.
 *
 * **M6-G addition (2026-05-06)**: `wikipediaIntegrationEnabled` is
 * appended to the v1 envelope as a backward-compatible field —
 * existing localStorage envelopes lacking it default to `true` via
 * `coerceToV1`, no version bump needed.
 */
export interface PersistedSlice {
  qualityMode: QualityMode;
  sunRenderMode: SunRenderMode;
  tutorialCompletionStatus: "not-seen" | LegacyTutorialStatus | null;
  graphicsPreset: GraphicsPresetName;
  graphicsAutoMode: boolean;
  graphicsOverrides: GraphicsOverrides;
  customBase: GraphicsBasePreset;
  accessibility: AccessibilityState;
  wikipediaIntegrationEnabled: boolean;
}

/** v0 envelope (what unmigrated users have in localStorage). */
export interface PersistedSliceV0 {
  qualityMode?: QualityMode;
  sunRenderMode?: SunRenderMode;
  tutorialCompletionStatus?: "not-seen" | LegacyTutorialStatus | null;
}

const isQualityMode = (v: unknown): v is QualityMode =>
  v === "auto" ||
  v === "ultra" ||
  v === "high" ||
  v === "balanced" ||
  v === "constrained";

const isSunRenderMode = (v: unknown): v is SunRenderMode =>
  v === "auto" || v === "texture" || v === "procedural";

const isLegacyTutorialStatus = (v: unknown): v is LegacyTutorialStatus =>
  v === "skipped" || v === "completed";

/**
 * Map a v0 `qualityMode` value to the v1 graphics slice fields
 * `(graphicsPreset, graphicsAutoMode, customBase)`. Mirror of
 * `graphics-settings-design.md §6` — kept as a pure helper so the
 * `migrate()` branch below and the v0→v1 tests share one definition.
 *
 * For `auto`, the preset label is `high` (a safe placeholder while
 * Auto is on; the resolver ignores it and picks the tier from device
 * signals). A missing/unrecognised qualityMode defaults to `auto` so a
 * corrupted envelope never crashes boot (impl-plan "Persist v0 → v1
 * migration" risk).
 */
export const deriveGraphicsFieldsFromQualityMode = (
  q: QualityMode | undefined | null
): {
  graphicsPreset: GraphicsPresetName;
  graphicsAutoMode: boolean;
  customBase: GraphicsBasePreset;
} => {
  switch (q) {
    case "ultra":
      return {
        graphicsPreset: "ultra",
        graphicsAutoMode: false,
        customBase: "ultra",
      };
    case "high":
      return {
        graphicsPreset: "high",
        graphicsAutoMode: false,
        customBase: "high",
      };
    case "balanced":
      return {
        graphicsPreset: "medium",
        graphicsAutoMode: false,
        customBase: "medium",
      };
    case "constrained":
      return {
        graphicsPreset: "low",
        graphicsAutoMode: false,
        customBase: "low",
      };
    case "auto":
    default:
      return {
        graphicsPreset: "high",
        graphicsAutoMode: true,
        customBase: "high",
      };
  }
};

/**
 * Migrate a persisted envelope from an older version to the current
 * `PERSIST_VERSION`. Called by Zustand's `persist` middleware on
 * rehydration when the stored `version` doesn't match.
 *
 * v0 → v1 (Wave α Commit 3): derive the graphics slice from `qualityMode`;
 * seed `graphicsOverrides: {}` and the platform-sensitive accessibility
 * defaults. `qualityMode`, `sunRenderMode`, and `tutorialCompletionStatus`
 * are preserved untouched — the store still reads `qualityMode` via the
 * compat shim until Wave 6 retires it.
 */
export const migrate = (
  persistedState: unknown,
  fromVersion: number
): PersistedSlice => {
  const input = (persistedState ?? {}) as Partial<
    PersistedSlice & PersistedSliceV0
  >;

  // If we're already at v1 shape, trust the fields and fill any gaps
  // (forward-compat degradation path: a corrupted v1 payload gets
  // re-seeded from v0 defaults rather than crashing boot).
  if (fromVersion >= 1) {
    return coerceToV1(input);
  }

  // v0 → v1: derive the new graphics + accessibility fields from
  // whatever the v0 envelope had.
  const qualityMode =
    input.qualityMode && isQualityMode(input.qualityMode)
      ? input.qualityMode
      : "auto";
  const sunRenderMode =
    input.sunRenderMode && isSunRenderMode(input.sunRenderMode)
      ? input.sunRenderMode
      : "auto";
  const tutorialCompletionStatus =
    input.tutorialCompletionStatus !== undefined
      ? input.tutorialCompletionStatus
      : null;

  const graphics = deriveGraphicsFieldsFromQualityMode(qualityMode);

  return {
    qualityMode,
    sunRenderMode,
    tutorialCompletionStatus,
    graphicsPreset: graphics.graphicsPreset,
    graphicsAutoMode: graphics.graphicsAutoMode,
    graphicsOverrides: {},
    customBase: graphics.customBase,
    accessibility: getDefaultAccessibilityState(),
    // M6-G default — Wikipedia integration is opt-out, not opt-in.
    wikipediaIntegrationEnabled: true,
  };
};

/**
 * Coerce an arbitrary partial payload into a well-formed v1 envelope,
 * filling missing fields from defaults. Used in the `fromVersion >= 1`
 * path (guards against truncated/corrupted storage).
 */
const coerceToV1 = (input: Partial<PersistedSlice>): PersistedSlice => ({
  qualityMode:
    input.qualityMode && isQualityMode(input.qualityMode)
      ? input.qualityMode
      : "auto",
  sunRenderMode:
    input.sunRenderMode && isSunRenderMode(input.sunRenderMode)
      ? input.sunRenderMode
      : "auto",
  tutorialCompletionStatus:
    input.tutorialCompletionStatus !== undefined
      ? input.tutorialCompletionStatus
      : null,
  graphicsPreset: input.graphicsPreset ?? DEFAULT_GRAPHICS_STATE.graphicsPreset,
  graphicsAutoMode:
    input.graphicsAutoMode ?? DEFAULT_GRAPHICS_STATE.graphicsAutoMode,
  graphicsOverrides:
    input.graphicsOverrides ?? DEFAULT_GRAPHICS_STATE.graphicsOverrides,
  customBase: input.customBase ?? DEFAULT_GRAPHICS_STATE.customBase,
  accessibility: input.accessibility ?? getDefaultAccessibilityState(),
  // M6-G: default ON for envelopes that lack the field (everyone
  // pre-2026-05-06). Explicit `=== false` check so a corrupted
  // envelope that stores a non-boolean still flips back to the
  // safe default.
  wikipediaIntegrationEnabled:
    input.wikipediaIntegrationEnabled === false ? false : true,
});

/**
 * If the unified `atlas-orbital-store` key is missing but one or more
 * legacy per-key slots are present, synthesise the unified envelope so
 * the persist middleware can rehydrate from it transparently on the
 * next hydration pass. Leaves the legacy slots in place — they become
 * a stale, one-time snapshot of the user's pre-persist settings; users
 * who roll back to a pre-persist build will read those, even though
 * subsequent changes on the new build no longer mirror back.
 *
 * Returns `true` if a new envelope was written, `false` otherwise.
 */
export const migrateLegacyStorage = (storage?: Storage | null): boolean => {
  const s =
    storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!s) return false;
  if (s.getItem(PERSIST_KEY) !== null) return false;

  const q = s.getItem(LEGACY_QUALITY_MODE_KEY);
  const r = s.getItem(LEGACY_SUN_RENDER_MODE_KEY);
  const t = s.getItem(LEGACY_TUTORIAL_STATUS_KEY);

  const legacy: Partial<PersistedSliceV0> = {};
  if (isQualityMode(q)) legacy.qualityMode = q;
  if (isSunRenderMode(r)) legacy.sunRenderMode = r;
  if (isLegacyTutorialStatus(t)) legacy.tutorialCompletionStatus = t;

  if (Object.keys(legacy).length === 0) return false;

  // Write as version 0 so Zustand's persist middleware runs `migrate()`
  // on rehydration — that's where v0→v1 derives `graphicsPreset`,
  // `graphicsAutoMode`, `customBase`, `graphicsOverrides`, and
  // `accessibility` from the `qualityMode` value we just seeded. If we
  // wrote the current `PERSIST_VERSION` here, Zustand would treat the
  // three-field envelope as already-migrated and the new graphics
  // slice fields would silently fall back to initial-state defaults
  // (the user's qualityMode preference effectively lost across the
  // Wave α upgrade).
  s.setItem(PERSIST_KEY, JSON.stringify({ state: legacy, version: 0 }));
  return true;
};

/**
 * Wraps a `Storage` so that `setItem(key, value)` becomes a no-op
 * when `value` is byte-identical to the last value observed for that
 * key. This is the core regression fix for write amplification: the
 * persist middleware calls `setItem` on every `set()`, but with
 * `partialize` pinning output to three fields the stringified payload
 * is constant across the vast majority of store mutations. A single
 * string comparison gates the actual `localStorage` round-trip.
 *
 * The dedupe cache is per-wrapper-instance and seeded lazily with the
 * first `setItem` call. This means the first write after a page load
 * always goes through even if it matches what's already in storage —
 * trivial cost, and it guarantees consistency in the unlikely event
 * the underlying storage was mutated by another tab between load and
 * first write.
 */
export const createDedupedStorage = (inner: Storage): Storage => {
  const lastWritten = new Map<string, string>();
  return {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      if (lastWritten.get(key) === value) return;
      lastWritten.set(key, value);
      inner.setItem(key, value);
    },
    removeItem: (key) => {
      lastWritten.delete(key);
      inner.removeItem(key);
    },
    clear: () => {
      lastWritten.clear();
      inner.clear();
    },
    key: (index) => inner.key(index),
    get length() {
      return inner.length;
    },
  };
};
