import * as THREE from "three";
import type { ResolvedQualityName } from "./qualityProfile";

export type DeferredTextureStatus = "idle" | "loading" | "ready" | "error";

export interface DeferredTextureSnapshot {
  url: string | null;
  status: DeferredTextureStatus;
  texture: THREE.Texture | null;
  error: string | null;
  estimatedBytes: number;
}

interface DeferredTextureEntry extends DeferredTextureSnapshot {
  snapshot: DeferredTextureSnapshot;
  listeners: Set<() => void>;
  promise: Promise<THREE.Texture> | null;
  refCount: number;
  pinCount: number;
  lastUsedAt: number;
  evictionTimer: number | null;
  colorSpace: THREE.ColorSpace;
  queued: boolean;
  loadPriority: number;
}

export interface DeferredTextureEvictionCandidate {
  url: string;
  estimatedBytes: number;
  refCount: number;
  pinCount: number;
  lastUsedAt: number;
}

const loader = new THREE.TextureLoader();
const entries = new Map<string, DeferredTextureEntry>();
const EMPTY_SNAPSHOT: DeferredTextureSnapshot = {
  url: null,
  status: "idle",
  texture: null,
  error: null,
  estimatedBytes: 0,
};
const emptySnapshotsByUrl = new Map<string, DeferredTextureSnapshot>();
const IDLE_EVICTION_MS = 20_000;
const MAX_CONCURRENT_TEXTURE_LOADS = 4;
const LOWEST_LOAD_PRIORITY = 3;
const MIPMAP_BYTE_FACTOR = 4 / 3;
const loadQueue: DeferredTextureEntry[] = [];

let textureBudgetBytes = 64 * 1024 * 1024;
let activeLoadCount = 0;
/**
 * Sum of the *admitted* estimates of the decodes currently in flight.
 * Kept as a counter rather than recomputed by scanning entries, because
 * `updateLoadedTextureEstimate` rewrites `estimatedBytes` between the
 * moment a load is admitted and the moment it settles — the decrement
 * has to use the value that was actually charged on admission.
 */
let inFlightBytes = 0;
let budgetEvictionScheduled = false;

const notifyEntry = (entry: DeferredTextureEntry) => {
  entry.listeners.forEach((listener) => listener());
};

const getNow = () => Date.now();

const createSnapshot = (
  url: string | null,
  status: DeferredTextureStatus,
  texture: THREE.Texture | null,
  error: string | null,
  estimatedBytes: number
): DeferredTextureSnapshot => ({
  url,
  status,
  texture,
  error,
  estimatedBytes,
});

const syncEntrySnapshot = (entry: DeferredTextureEntry) => {
  entry.snapshot = createSnapshot(
    entry.url,
    entry.status,
    entry.texture,
    entry.error,
    entry.estimatedBytes
  );
};

/**
 * Upper-bound long edge inferred from the filename tier token.
 *
 * Deliberately pessimistic wherever it has to guess, because an admission
 * gate that under-counts is not a gate. The previous no-match default of
 * 1024 scored the untiered maps — `uranus_texture_map_8k_…jpg` (8000x4336)
 * and `jupiter_vgr1_2025.jpg` (7200x3600) — at 5.6 MB against a real
 * 176.4 / 131.8 MB, a ~30x under-count on exactly the path a gate must not
 * miss. `updateLoadedTextureEstimate` still corrects the entry to the
 * measured size once the image has decoded.
 */
const inferTextureEdge = (url: string) => {
  const match = url.match(/(?:^|\/)(boot|(\d+)k)[-_]/i);
  if (!match) {
    return 8192;
  }

  if (match[1]?.toLowerCase() === "boot") {
    return 1024;
  }

  const kiloValue = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(kiloValue) || kiloValue <= 0) {
    return 8192;
  }

  return kiloValue * 1024;
};

/**
 * Every planetary map in this repo is 2:1 equirectangular. The former
 * square assumption doubled every tiered estimate (`8k_earth_daymap` is
 * 8192x4096, not 8192²), which made the gate twice as strict as the
 * hardware it is protecting.
 *
 * Known residual: names understate some plates. `4k_mimas.jpg` is
 * 6356x3178, so it is still under-counted ~2.4x. That is a far smaller
 * class than the ~30x the untiered fallback used to allow, but it is not
 * zero — the pre-decode estimate is a bound, never a measurement.
 */
export const estimateTextureByteSize = (url: string) => {
  const edge = inferTextureEdge(url);
  return estimateTextureByteSizeFromDimensions(edge, edge / 2);
};

export const estimateTextureByteSizeFromDimensions = (
  width: number,
  height: number,
  generateMipmaps = true
) => {
  const baseBytes = Math.max(0, width) * Math.max(0, height) * 4;
  return Math.ceil(baseBytes * (generateMipmaps ? MIPMAP_BYTE_FACTOR : 1));
};

export const resolveDeferredTextureBudget = (
  profileName: ResolvedQualityName
) => {
  if (profileName === "ultra") {
    return 512 * 1024 * 1024;
  }

  if (profileName === "high") {
    return 256 * 1024 * 1024;
  }

  if (profileName === "balanced") {
    return 64 * 1024 * 1024;
  }

  if (profileName === "constrained") {
    return 32 * 1024 * 1024;
  }

  return 32 * 1024 * 1024;
};

export const selectEvictionVictims = (
  candidates: DeferredTextureEvictionCandidate[],
  budgetBytes: number | null
) => {
  if (budgetBytes == null) {
    return [] as string[];
  }

  const totalBytes = candidates.reduce(
    (sum, candidate) => sum + candidate.estimatedBytes,
    0
  );

  if (totalBytes <= budgetBytes) {
    return [] as string[];
  }

  const evictable = [...candidates]
    .filter((candidate) => candidate.refCount === 0 && candidate.pinCount === 0)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  let bytesToTrim = totalBytes - budgetBytes;
  const victims: string[] = [];

  for (const candidate of evictable) {
    victims.push(candidate.url);
    bytesToTrim -= candidate.estimatedBytes;
    if (bytesToTrim <= 0) {
      break;
    }
  }

  return victims;
};

const disposeEntryTexture = (entry: DeferredTextureEntry) => {
  const texture = entry.texture;
  const image = texture?.source?.data;
  texture?.dispose();
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    image.close();
  }
  entry.texture = null;
  entry.status = "idle";
  entry.error = null;
  entry.promise = null;
  syncEntrySnapshot(entry);
};

const clearEntryEvictionTimer = (entry: DeferredTextureEntry) => {
  if (entry.evictionTimer != null && typeof window !== "undefined") {
    window.clearTimeout(entry.evictionTimer);
  }
  entry.evictionTimer = null;
};

const evictEntryIfPossible = (entry: DeferredTextureEntry) => {
  if (entry.refCount > 0 || entry.pinCount > 0 || entry.status !== "ready") {
    return false;
  }

  clearEntryEvictionTimer(entry);
  disposeEntryTexture(entry);
  notifyEntry(entry);
  return true;
};

const evictToBudget = () => {
  const candidates = [...entries.values()]
    .filter((entry) => entry.status === "ready")
    .map<DeferredTextureEvictionCandidate>((entry) => ({
      url: entry.url!,
      estimatedBytes: entry.estimatedBytes,
      refCount: entry.refCount,
      pinCount: entry.pinCount,
      lastUsedAt: entry.lastUsedAt,
    }));

  const victims = selectEvictionVictims(candidates, textureBudgetBytes);
  victims.forEach((url) => {
    const entry = entries.get(url);
    if (entry) {
      evictEntryIfPossible(entry);
    }
  });
};

/**
 * Admission control — the budget check that happens *before* a fetch.
 *
 * What `textureBudgetBytes` bounds after this: (a) the bytes of decodes
 * running concurrently, and (b) how long *unreferenced* ready textures
 * linger. What it still does not bound: the referenced working set.
 * `selectEvictionVictims` and `evictEntryIfPossible` both refuse an entry
 * with `refCount > 0`, so a focused body's bytes are unevictable by
 * construction — Earth at ultra is still 853.3 MB. Feeding resident bytes
 * into this predicate would make it permanently false on every profile
 * (the overview band alone is 440.6 MB against a 32–512 MB budget) and
 * collapse the app to one decode at a time, so it deliberately does not.
 *
 * Progress rule: when nothing is decoding, admit regardless of size. A
 * single asset can exceed the whole budget, and refusing it forever would
 * strand the body on its procedural placeholder. So the overshoot is
 * capped at one texture instead of four rather than eliminated. This is
 * also the anti-deadlock invariant — `activeLoadCount` always drains to 0
 * in the `.finally` of every admitted load, which re-opens the gate.
 */
const admitLoad = (entry: DeferredTextureEntry) =>
  activeLoadCount === 0 ||
  inFlightBytes + entry.estimatedBytes <= textureBudgetBytes;

const scheduleBudgetEviction = () => {
  if (budgetEvictionScheduled) {
    return;
  }

  budgetEvictionScheduled = true;
  queueMicrotask(() => {
    budgetEvictionScheduled = false;
    evictToBudget();
  });
};

const scheduleIdleEviction = (entry: DeferredTextureEntry) => {
  if (typeof window === "undefined") {
    return;
  }

  clearEntryEvictionTimer(entry);
  entry.evictionTimer = window.setTimeout(() => {
    evictEntryIfPossible(entry);
    evictToBudget();
  }, IDLE_EVICTION_MS);
};

const ensureEntry = (url: string, colorSpace?: THREE.ColorSpace) => {
  let entry = entries.get(url);
  if (entry) {
    if (colorSpace && entry.status === "idle") {
      entry.colorSpace = colorSpace;
    }
    return entry;
  }

  entry = {
    url,
    status: "idle",
    texture: null,
    error: null,
    estimatedBytes: estimateTextureByteSize(url),
    snapshot: EMPTY_SNAPSHOT,
    listeners: new Set(),
    promise: null,
    refCount: 0,
    pinCount: 0,
    lastUsedAt: getNow(),
    evictionTimer: null,
    colorSpace: colorSpace ?? THREE.SRGBColorSpace,
    queued: false,
    loadPriority: LOWEST_LOAD_PRIORITY,
  };
  syncEntrySnapshot(entry);
  entries.set(url, entry);
  return entry;
};

const removeQueuedEntry = (entry: DeferredTextureEntry) => {
  const queueIndex = loadQueue.indexOf(entry);
  if (queueIndex >= 0) {
    loadQueue.splice(queueIndex, 1);
  }
  entry.queued = false;
};

const updateLoadedTextureEstimate = (
  entry: DeferredTextureEntry,
  texture: THREE.Texture
) => {
  const image = texture.source?.data as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
      }
    | undefined;
  const width = image?.naturalWidth ?? image?.width;
  const height = image?.naturalHeight ?? image?.height;

  if (
    typeof width === "number" &&
    Number.isFinite(width) &&
    typeof height === "number" &&
    Number.isFinite(height)
  ) {
    entry.estimatedBytes = estimateTextureByteSizeFromDimensions(
      width,
      height,
      texture.generateMipmaps
    );
  }
};

const pumpLoadQueue = () => {
  loadQueue.sort(
    (left, right) =>
      left.loadPriority - right.loadPriority ||
      left.lastUsedAt - right.lastUsedAt
  );

  while (
    activeLoadCount < MAX_CONCURRENT_TEXTURE_LOADS &&
    loadQueue.length > 0
  ) {
    const entry = loadQueue[0];
    if (!entry.queued || entry.refCount === 0 || entry.status !== "loading") {
      loadQueue.shift();
      entry.queued = false;
      continue;
    }

    if (!admitLoad(entry)) {
      // Head-of-line stop, not a refusal. The entry stays queued and
      // `loading`, so `useProgressiveDeferredTexture` keeps showing the
      // last ready tier rather than falling back to a procedural surface.
      // Marking it `error` instead would be sticky — `startLoad` only
      // re-queues on a fresh acquire — so a transient spike would strand
      // the texture permanently. Strict head-of-line rather than
      // best-fit backfill: starvation-free by construction, and the queue
      // is priority-sorted above, so the blocked entry is the most
      // important thing on screen. Retried from the `.finally` below and
      // from `setDeferredTextureBudget`.
      return;
    }

    loadQueue.shift();
    entry.queued = false;
    activeLoadCount += 1;
    const admittedBytes = entry.estimatedBytes;
    inFlightBytes += admittedBytes;
    const loaded = loader.loadAsync(entry.url!);
    entry.promise = loaded;

    void loaded
      .then((texture) => {
        texture.colorSpace = entry.colorSpace;
        texture.needsUpdate = true;
        updateLoadedTextureEstimate(entry, texture);
        entry.texture = texture;
        entry.status = "ready";
        entry.error = null;
        entry.lastUsedAt = getNow();
        syncEntrySnapshot(entry);
        notifyEntry(entry);

        if (entry.refCount === 0 && entry.pinCount === 0) {
          // The request became irrelevant while the browser was decoding it.
          // It was never displayed, so there is no navigation benefit in
          // retaining it for the normal post-display grace period.
          evictEntryIfPossible(entry);
          return;
        }
        evictToBudget();
      })
      .catch((error: unknown) => {
        entry.texture = null;
        entry.status = "error";
        entry.error = error instanceof Error ? error.message : "Failed to load";
        syncEntrySnapshot(entry);
        notifyEntry(entry);
      })
      .finally(() => {
        if (entry.promise === loaded) {
          entry.promise = null;
        }
        // Discharged here rather than in `.then` so the error path
        // releases the reservation too.
        inFlightBytes = Math.max(0, inFlightBytes - admittedBytes);
        activeLoadCount = Math.max(0, activeLoadCount - 1);
        pumpLoadQueue();
      });
  }
};

const startLoad = (entry: DeferredTextureEntry, priority: number) => {
  entry.loadPriority = Math.min(
    entry.loadPriority,
    THREE.MathUtils.clamp(Math.round(priority), 0, LOWEST_LOAD_PRIORITY)
  );

  if (entry.promise || entry.status === "ready") {
    return;
  }

  if (entry.queued) {
    pumpLoadQueue();
    return;
  }

  entry.status = "loading";
  entry.error = null;
  entry.queued = true;
  loadQueue.push(entry);
  syncEntrySnapshot(entry);
  notifyEntry(entry);
  pumpLoadQueue();
};

export const setDeferredTextureBudget = (budgetBytes: number) => {
  textureBudgetBytes = budgetBytes;
  evictToBudget();
  // A budget *raise* can admit work that admission control parked. The
  // profile can change at any time (`Scene.tsx` sets the budget from it),
  // and a constrained→ultra upgrade must not wait for the next
  // camera-driven acquire to release the queue.
  pumpLoadQueue();
};

export const getDeferredTextureSnapshot = (
  url?: string | null
): DeferredTextureSnapshot => {
  if (!url) {
    return EMPTY_SNAPSHOT;
  }

  const entry = entries.get(url);
  if (entry) {
    return entry.snapshot;
  }

  let emptySnapshot = emptySnapshotsByUrl.get(url);
  if (!emptySnapshot) {
    emptySnapshot = createSnapshot(url, "idle", null, null, 0);
    emptySnapshotsByUrl.set(url, emptySnapshot);
  }
  return emptySnapshot;
};

export const subscribeToDeferredTexture = (
  url: string,
  listener: () => void
) => {
  const entry = ensureEntry(url);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
};

export const acquireDeferredTexture = (
  url: string,
  options?: {
    pin?: boolean;
    colorSpace?: THREE.ColorSpace;
    priority?: number;
  }
) => {
  const entry = ensureEntry(url, options?.colorSpace);
  entry.refCount += 1;
  if (options?.pin) {
    entry.pinCount += 1;
  }
  entry.lastUsedAt = getNow();
  clearEntryEvictionTimer(entry);
  startLoad(entry, options?.priority ?? LOWEST_LOAD_PRIORITY);
};

export const releaseDeferredTexture = (
  url: string,
  options?: { pin?: boolean }
) => {
  const entry = entries.get(url);
  if (!entry) {
    return;
  }

  entry.refCount = Math.max(0, entry.refCount - 1);
  if (options?.pin) {
    entry.pinCount = Math.max(0, entry.pinCount - 1);
  }
  entry.lastUsedAt = getNow();

  if (entry.refCount === 0) {
    if (entry.queued && entry.pinCount === 0) {
      removeQueuedEntry(entry);
      entry.status = "idle";
      entry.error = null;
      entry.loadPriority = LOWEST_LOAD_PRIORITY;
      syncEntrySnapshot(entry);
      notifyEntry(entry);
      pumpLoadQueue();
      return;
    }

    scheduleIdleEviction(entry);
    scheduleBudgetEviction();
  }
};

export const getDeferredTextureCacheStatsForTests = () => {
  return {
    activeLoadCount,
    inFlightBytes,
    queuedLoadCount: loadQueue.filter((entry) => entry.queued).length,
    readyBytes: [...entries.values()]
      .filter((entry) => entry.status === "ready")
      .reduce((sum, entry) => sum + entry.estimatedBytes, 0),
  };
};

export const resetDeferredTextureCacheForTests = () => {
  loadQueue.splice(0, loadQueue.length);
  entries.forEach((entry) => {
    entry.queued = false;
    clearEntryEvictionTimer(entry);
    disposeEntryTexture(entry);
  });
  entries.clear();
  emptySnapshotsByUrl.clear();
  textureBudgetBytes = 64 * 1024 * 1024;
  activeLoadCount = 0;
  inFlightBytes = 0;
  budgetEvictionScheduled = false;
};
