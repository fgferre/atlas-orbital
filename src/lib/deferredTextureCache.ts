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

let textureBudgetBytes: number | null = null;

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

const inferTextureEdge = (url: string) => {
  const match = url.match(/(?:^|\/)(boot|(\d+)k)[-_]/i);
  if (!match) {
    return 1024;
  }

  if (match[1]?.toLowerCase() === "boot") {
    return 1024;
  }

  const kiloValue = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(kiloValue) || kiloValue <= 0) {
    return 1024;
  }

  return kiloValue * 1024;
};

export const estimateTextureByteSize = (url: string) => {
  const edge = inferTextureEdge(url);
  return edge * edge * 4;
};

export const resolveDeferredTextureBudget = (
  profileName: ResolvedQualityName
) => {
  if (profileName === "balanced") {
    return 64 * 1024 * 1024;
  }

  if (profileName === "constrained") {
    return 32 * 1024 * 1024;
  }

  return null;
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
  entry.texture?.dispose();
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

const scheduleIdleEviction = (entry: DeferredTextureEntry) => {
  if (textureBudgetBytes == null || typeof window === "undefined") {
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
  };
  syncEntrySnapshot(entry);
  entries.set(url, entry);
  return entry;
};

const startLoad = (entry: DeferredTextureEntry) => {
  if (entry.promise || entry.status === "ready") {
    return;
  }

  entry.status = "loading";
  entry.error = null;
  syncEntrySnapshot(entry);
  notifyEntry(entry);

  const loaded = loader.loadAsync(entry.url!).then((texture) => {
    texture.colorSpace = entry.colorSpace;
    texture.needsUpdate = true;
    entry.texture = texture;
    entry.status = "ready";
    entry.promise = null;
    entry.lastUsedAt = getNow();
    syncEntrySnapshot(entry);
    notifyEntry(entry);
    evictToBudget();
    return texture;
  });
  entry.promise = loaded;
  // Handle load failure on a SIDE consumer (not chained into
  // entry.promise, so its Promise<Texture> type is preserved). This
  // both records the error state AND registers a rejection handler on
  // `loaded`, so a failed fetch/404/decode no longer surfaces as an
  // unhandled promise rejection — the previous re-throw did, because
  // the acquire/preload call sites never await entry.promise. Consumers
  // read the failure via entry.status / the snapshot+listener channel.
  void loaded.catch((error: unknown) => {
    entry.texture = null;
    entry.status = "error";
    entry.error = error instanceof Error ? error.message : "Failed to load";
    entry.promise = null;
    syncEntrySnapshot(entry);
    notifyEntry(entry);
  });
};

export const setDeferredTextureBudget = (budgetBytes: number | null) => {
  textureBudgetBytes = budgetBytes;
  evictToBudget();
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
  options?: { pin?: boolean; colorSpace?: THREE.ColorSpace }
) => {
  const entry = ensureEntry(url, options?.colorSpace);
  entry.refCount += 1;
  if (options?.pin) {
    entry.pinCount += 1;
  }
  entry.lastUsedAt = getNow();
  clearEntryEvictionTimer(entry);
  startLoad(entry);
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
    scheduleIdleEviction(entry);
    evictToBudget();
  }
};

export const preloadDeferredTexture = (
  url: string,
  options?: { pin?: boolean; colorSpace?: THREE.ColorSpace }
) => {
  const entry = ensureEntry(url, options?.colorSpace);
  if (options?.pin) {
    entry.pinCount += 1;
  }
  startLoad(entry);
  return entry.promise ?? Promise.resolve(entry.texture);
};

export const resetDeferredTextureCacheForTests = () => {
  entries.forEach((entry) => {
    clearEntryEvictionTimer(entry);
    disposeEntryTexture(entry);
  });
  entries.clear();
  emptySnapshotsByUrl.clear();
  textureBudgetBytes = null;
};
