/**
 * Wikipedia summary cache — IndexedDB-backed, count-bounded LRU.
 *
 * Wikipedia summaries don't change frequently and the user's
 * star-focus pattern often revisits the same handful of named
 * stars across sessions. Persisting summaries between visits
 * saves bandwidth + the 1-second per-tab rate-limit gate the
 * `wikipediaClient` imposes on each request.
 *
 * **Storage**: one IndexedDB database (`atlas-wikipedia-cache`)
 * with one object store (`summaries`). Keys are
 * `${lang}:${title}` strings (collision-free since both halves
 * are URL-encoded by callers); values are
 * `{ summary, fetchedAt }`.
 *
 * **Eviction**: count-bounded LRU at 200 entries (matches the
 * wave-file spec). The "L" part is "least recently fetched":
 * `set` updates `fetchedAt`; `get` does NOT (no read-side
 * touch). This is simpler than full LRU + still good enough for
 * the use case — a star you re-visit gets re-fetched once a
 * day at most (the typical Wikipedia revision cadence isn't
 * higher anyway), and the entry's `fetchedAt` advances on
 * write.
 *
 * **TTL**: 30-day staleness — entries older than that are
 * treated as a miss by `get` so the client re-fetches and
 * overwrites with a fresh `fetchedAt`.
 */

import { openDB, type IDBPDatabase } from "idb";

import type { WikipediaSummary } from "./wikipediaClient";

export interface WikipediaCacheEntry {
  summary: WikipediaSummary;
  /** Epoch milliseconds when the entry was last written. */
  fetchedAt: number;
}

export interface WikipediaCache {
  get(title: string, lang: string): Promise<WikipediaCacheEntry | null>;
  set(title: string, lang: string, summary: WikipediaSummary): Promise<void>;
  /**
   * Drop every cached entry. Useful for tests + the future
   * sub-track G "purge cache" affordance.
   */
  clear(): Promise<void>;
  /**
   * Close the underlying IndexedDB connection. Tests use this
   * to release the open handle so `vitest`'s after-suite
   * teardown doesn't hold the database open across files.
   */
  close(): Promise<void>;
}

export interface WikipediaCacheConfig {
  /** IndexedDB name. Default `atlas-wikipedia-cache`. */
  dbName?: string;
  /** Object store name. Default `summaries`. */
  storeName?: string;
  /** Cache entry TTL in ms. Default 30 days. */
  ttlMs?: number;
  /** Max entries before LRU eviction kicks in. Default 200. */
  maxEntries?: number;
  /** Inject a clock (used by tests under fake timers). */
  nowImpl?: () => number;
  /** Inject `idb`'s `openDB` (used by tests for isolation). */
  openDbImpl?: typeof openDB;
}

const DEFAULT_DB_NAME = "atlas-wikipedia-cache";
const DEFAULT_STORE_NAME = "summaries";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

const FETCHED_AT_INDEX = "fetchedAt";

const buildKey = (title: string, lang: string): string => `${lang}:${title}`;

/**
 * Create a Wikipedia summary cache instance. Each instance owns
 * its own database connection (lazy: opens on first call) and
 * its own bounded LRU window. Tests construct fresh instances
 * with a unique `dbName` so they don't collide.
 */
export function createWikipediaCache(
  config: WikipediaCacheConfig = {}
): WikipediaCache {
  const dbName = config.dbName ?? DEFAULT_DB_NAME;
  const storeName = config.storeName ?? DEFAULT_STORE_NAME;
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = config.nowImpl ?? Date.now;
  const openDbImpl = config.openDbImpl ?? openDB;

  let dbPromise: Promise<IDBPDatabase> | null = null;

  async function ensureDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
      dbPromise = openDbImpl(dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName);
            store.createIndex(FETCHED_AT_INDEX, "fetchedAt");
          }
        },
      });
    }
    return dbPromise;
  }

  async function get(
    title: string,
    lang: string
  ): Promise<WikipediaCacheEntry | null> {
    const db = await ensureDb();
    const entry = (await db.get(storeName, buildKey(title, lang))) as
      | WikipediaCacheEntry
      | undefined;
    if (!entry) return null;
    if (now() - entry.fetchedAt > ttlMs) return null;
    return entry;
  }

  async function set(
    title: string,
    lang: string,
    summary: WikipediaSummary
  ): Promise<void> {
    const db = await ensureDb();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const key = buildKey(title, lang);
    await store.put({ summary, fetchedAt: now() }, key);

    // Count-bounded LRU sweep. After a put we may have exceeded
    // the cap; walk the `fetchedAt` index in ascending order and
    // delete the oldest until we're back under. Done in the same
    // transaction so concurrent puts don't see a transient
    // over-cap state externally.
    const count = await store.count();
    if (count > maxEntries) {
      let toDelete = count - maxEntries;
      let cursor = await store.index(FETCHED_AT_INDEX).openCursor();
      while (cursor && toDelete > 0) {
        await cursor.delete();
        toDelete--;
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }

  async function clear(): Promise<void> {
    const db = await ensureDb();
    await db.clear(storeName);
  }

  async function close(): Promise<void> {
    if (!dbPromise) return;
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }

  return { get, set, clear, close };
}

/**
 * Module-default singleton consumers (the default
 * `wikipediaClient`) wire transparently.
 */
export const wikipediaCache: WikipediaCache = createWikipediaCache();
