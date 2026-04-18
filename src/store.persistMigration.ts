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

export const PERSIST_KEY = "atlas-orbital-store";
export const PERSIST_VERSION = 0;

export const LEGACY_QUALITY_MODE_KEY = "qualityMode";
export const LEGACY_SUN_RENDER_MODE_KEY = "sunRenderMode";
export const LEGACY_TUTORIAL_STATUS_KEY = "tutorialStatus";

export type LegacyTutorialStatus = "skipped" | "completed";

export interface PersistedSlice {
  qualityMode: QualityMode;
  sunRenderMode: SunRenderMode;
  tutorialCompletionStatus: "not-seen" | LegacyTutorialStatus | null;
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

  const legacy: Partial<PersistedSlice> = {};
  if (isQualityMode(q)) legacy.qualityMode = q;
  if (isSunRenderMode(r)) legacy.sunRenderMode = r;
  if (isLegacyTutorialStatus(t)) legacy.tutorialCompletionStatus = t;

  if (Object.keys(legacy).length === 0) return false;

  s.setItem(
    PERSIST_KEY,
    JSON.stringify({ state: legacy, version: PERSIST_VERSION })
  );
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
