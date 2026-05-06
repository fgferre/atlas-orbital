/**
 * Wikipedia REST API client — backs M6 sub-track D's HygStarPanel
 * "About" section (and any future curated-body panels).
 *
 * Wraps the upstream `api/rest_v1/page/summary/{title}` endpoint
 * with a minimal extract + thumbnail + canonical-URL contract while
 * handling the operational concerns Atlas's interactive workflow
 * needs: per-tab serialized request spacing, per-request timeout,
 * suffix-based disambiguation, and a single en-fallback when the
 * user's Wikipedia language has no article.
 *
 * **Browser-context corrections vs the original Gaia port** (Codex
 * round-5b audit, 2026-05-06):
 *
 * - The browser sends its own `User-Agent`; setting it via
 *   `fetch()` headers is silently ignored. MediaWiki accepts the
 *   alternative `Api-User-Agent` request header for client-side
 *   identification per
 *   <https://www.mediawiki.org/wiki/API:Cross-site_requests> and
 *   <https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy/en>.
 *   Atlas sends `Api-User-Agent: "atlas-orbital/<version> (URL)"`.
 * - Wikipedia uses 2-letter language codes (`en`, `pt`, ...).
 *   `pt-BR.wikipedia.org` does not exist; map atlas's locale codes
 *   to Wikipedia's via `mapLanguageCode` (e.g. `pt-BR → pt`).
 * - The REST endpoint
 *   (`api/rest_v1/page/summary/{title}`) sends CORS headers by
 *   default, so it does NOT need `&origin=*`. The legacy Action
 *   API endpoints (langlinks / redirects) DO need it; this client
 *   doesn't call them — when a localized page is missing, we just
 *   try the English summary directly, simpler than walking
 *   langlinks for one fallback.
 *
 * **Rate-limit math vs Gaia's `DataInfoWindow.java:153-161`** (Codex
 * round-5b audit, 2026-05-06): Gaia sleeps for the **elapsed**
 * time since the last request — `Thread.sleep(now -
 * lastTrackedRequest)` — which is wrong (sleeping 200 ms when
 * 1000 ms is required gives total spacing 400 ms, still under the
 * limit). Atlas sleeps for the **remaining** wait,
 * `Math.max(0, REQUEST_WAIT_MS - (now - lastRequestStartedAt))`.
 * The "matches Gaia exactly" framing is abandoned for this reason.
 * Note also that client-side rate limiting only serializes per
 * tab/module instance; it cannot enforce Wikimedia-wide or per-IP
 * limits across users. That is acceptable for Atlas's interactive
 * single-user workflow but should not be described as a defense
 * against Wikimedia-side abuse.
 */

import { wikipediaCache as defaultWikipediaCache } from "./wikipediaCache";

export interface WikipediaSummary {
  /** Page title as Wikipedia returned it (after redirects). */
  title: string;
  /** Plain-text summary (~250 chars in most cases). */
  extract: string;
  /** Thumbnail image URL, or `null` if the page has no lead image. */
  thumbnailUrl: string | null;
  /** Canonical desktop URL for the user's "Read more" link. */
  pageUrl: string;
  /** Wikipedia language code that served the response (e.g. `"pt"`, `"en"`). */
  language: string;
}

export interface FetchSummaryOptions {
  /**
   * App-level locale (e.g. `"pt-BR"`, `"en"`). Mapped to a
   * Wikipedia 2-letter code internally. Defaults to `"en"` when
   * unset or unmappable.
   */
  lang?: string;
  /**
   * Title suffixes tried in order to disambiguate (e.g. `"_(star)"`
   * before `""` so `Sirius_(star)` is preferred over
   * `Sirius` — important since the unsuffixed page may resolve to a
   * disambiguation index). Default `["_(star)", ""]`.
   */
  suffixes?: string[];
  /**
   * Caller's abort signal. Aborts the in-flight fetch + the queue
   * wait phase. Rejects with the signal's reason (or
   * `AbortError`).
   */
  signal?: AbortSignal;
}

export interface WikipediaClient {
  fetchSummary(
    query: string,
    options?: FetchSummaryOptions
  ): Promise<WikipediaSummary | null>;
}

/**
 * Minimal interface every wikipediaClient cache must satisfy. The
 * real implementation lives in `./wikipediaCache.ts`; tests can
 * inject any object that meets this contract (including no-op
 * stubs that return null on every read).
 */
export interface WikipediaCacheLike {
  get(
    title: string,
    lang: string
  ): Promise<{ summary: WikipediaSummary; fetchedAt: number } | null>;
  set(title: string, lang: string, summary: WikipediaSummary): Promise<void>;
}

export interface WikipediaClientConfig {
  /** Override the `Api-User-Agent` header. */
  appUserAgent?: string;
  /** Minimum ms between request starts (default 1000). */
  requestWaitMs?: number;
  /** Per-request timeout in ms (default 15000). */
  requestTimeoutMs?: number;
  /** Default Wikipedia language used when `options.lang` is unset. */
  defaultLang?: string;
  /** Inject a fetch implementation (used by tests for mocking). */
  fetchImpl?: typeof fetch;
  /** Inject a clock function (used by tests under fake timers). */
  nowImpl?: () => number;
  /**
   * IndexedDB-backed cache (M6-F). When provided the client reads
   * cache first, falls through to the network on miss, and writes
   * the network result back. Omitted (the default for
   * `createWikipediaClient`) → no caching, every call goes to the
   * network. Tests pass either a real cache, a fake, or omit
   * entirely.
   */
  cache?: WikipediaCacheLike;
}

/**
 * App identifier for the Wikipedia API user-agent header. Bumped
 * manually with the `package.json` version on each release; the
 * Wikimedia user-agent policy only requires identification, not
 * a precise build hash.
 */
const DEFAULT_APP_USER_AGENT =
  "atlas-orbital/0.1.0 (https://github.com/fgferre/atlas-orbital)";

const DEFAULT_REQUEST_WAIT_MS = 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LANG = "en";
const DEFAULT_SUFFIXES: readonly string[] = ["_(star)", ""];

/**
 * Wikipedia language sub-domains all Atlas locales we care about
 * map cleanly to. Anything not listed falls through to the base
 * (`pt-BR → pt`, `pt-PT → pt`, `en-US → en`, etc.) via
 * `mapLanguageCode`.
 */
const EXPLICIT_LANG_MAP: Record<string, string> = {
  "pt-br": "pt",
  "pt-pt": "pt",
  "en-us": "en",
  "en-gb": "en",
};

/**
 * Map an app-level locale to its Wikipedia 2-letter code. Returns
 * the default (`"en"`) for empty / non-string input.
 */
export function mapLanguageCode(
  lang: string | null | undefined,
  defaultLang: string = DEFAULT_LANG
): string {
  if (typeof lang !== "string" || lang.length === 0) return defaultLang;
  const lower = lang.toLowerCase();
  const explicit = EXPLICIT_LANG_MAP[lower];
  if (explicit) return explicit;
  const base = lower.split("-")[0];
  return base.length > 0 ? base : defaultLang;
}

interface SummaryResponseBody {
  type?: string; // "standard" | "disambiguation" | "no-extract" | ...
  title?: string;
  extract?: string;
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

function buildSummaryUrl(lang: string, title: string): string {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
}

function buildAbortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new DOMException("Aborted", "AbortError");
}

/**
 * Sleep for `ms` milliseconds. Resolves on timer fire; rejects if
 * `signal` aborts in the meantime. Uses `setTimeout` so vitest's
 * `vi.useFakeTimers()` can drive it deterministically in tests.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(buildAbortError(signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(buildAbortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Construct an AbortController whose signal aborts when EITHER:
 * - `callerSignal` aborts (forwards its `reason`), OR
 * - `timeoutMs` elapses (aborts with a TimeoutError-shaped
 *   DOMException).
 *
 * Returns the controller plus a `cleanup` callback to clear the
 * timeout timer once the request completes (success or failure).
 *
 * Hand-rolled instead of `AbortSignal.any([...])` so vitest's
 * fake timers can drive both legs deterministically; `AbortSignal.
 * timeout()` ties into engine-internal timer plumbing that fake
 * timers don't always intercept.
 */
function createCombinedAbort(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort(buildAbortError(callerSignal?.reason));
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(buildAbortError(callerSignal.reason));
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Build a fresh Wikipedia client. Each instance owns its own
 * serialization queue + last-request timestamp, so tests can
 * exercise the rate-limit math against a clean slate.
 */
export function createWikipediaClient(
  config: WikipediaClientConfig = {}
): WikipediaClient {
  const fetchImpl =
    config.fetchImpl ?? globalThis.fetch?.bind(globalThis) ?? fetch;
  const now = config.nowImpl ?? Date.now;
  const requestWaitMs = config.requestWaitMs ?? DEFAULT_REQUEST_WAIT_MS;
  const requestTimeoutMs =
    config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const defaultLang = config.defaultLang ?? DEFAULT_LANG;
  const appUserAgent = config.appUserAgent ?? DEFAULT_APP_USER_AGENT;
  const cache = config.cache;

  let lastRequestStartedAt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Run `fn` after the rate-limit gate clears. The gate sleeps for
   * the **remaining** wait (`max(0, requestWaitMs - elapsed)`), not
   * the elapsed time — see the file-level comment for the Gaia
   * deviation. Errors don't break the chain: the queue tail
   * swallows them so subsequent requests proceed.
   */
  function serializeRequest<T>(
    signal: AbortSignal | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    const tail = queue.then(async () => {
      if (signal?.aborted) {
        throw buildAbortError(signal.reason);
      }
      const elapsed = now() - lastRequestStartedAt;
      const wait = Math.max(0, requestWaitMs - elapsed);
      if (wait > 0) {
        await sleep(wait, signal);
      }
      if (signal?.aborted) {
        throw buildAbortError(signal.reason);
      }
      lastRequestStartedAt = now();
      return fn();
    });
    queue = tail.then(
      () => undefined,
      () => undefined
    );
    return tail;
  }

  /**
   * Fetch one summary at a specific language + title. Returns the
   * parsed `WikipediaSummary` on 200, `null` on 404 / disambiguation
   * / missing-extract. Throws on network failure or non-404 / non-
   * 200 status, on timeout, and on caller abort.
   *
   * Cache integration (M6-F): when a cache is configured, the read
   * happens BEFORE the rate-limit gate so a hit doesn't pay the
   * 1-second per-tab spacing. A miss falls through to the network
   * path; a successful network result is written back to the cache
   * before returning. Cache failures (IDB blocked, quota, ...) are
   * swallowed — the client must remain usable when the cache is
   * unavailable.
   */
  async function fetchSummaryAtLang(
    lang: string,
    title: string,
    signal: AbortSignal | undefined
  ): Promise<WikipediaSummary | null> {
    if (cache) {
      try {
        const cached = await cache.get(title, lang);
        if (cached) return cached.summary;
      } catch {
        // Swallow cache read errors; treat as miss.
      }
    }
    return serializeRequest(signal, async () => {
      const { signal: combinedSignal, cleanup } = createCombinedAbort(
        requestTimeoutMs,
        signal
      );
      try {
        const response = await fetchImpl(buildSummaryUrl(lang, title), {
          headers: { "Api-User-Agent": appUserAgent },
          signal: combinedSignal,
        });
        if (response.status === 404) return null;
        if (!response.ok) {
          throw new Error(
            `Wikipedia summary request failed: ${response.status} ${response.statusText}`
          );
        }
        const body = (await response.json()) as SummaryResponseBody;
        if (body.type === "disambiguation") return null;
        if (typeof body.extract !== "string" || body.extract.length === 0) {
          return null;
        }
        const summary: WikipediaSummary = {
          title: body.title ?? title,
          extract: body.extract,
          thumbnailUrl: body.thumbnail?.source ?? null,
          pageUrl:
            body.content_urls?.desktop?.page ??
            `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          language: lang,
        };
        if (cache) {
          // Fire-and-forget cache write. We intentionally don't
          // await — a slow IDB write should never delay the
          // returned summary, and write errors don't affect this
          // request's outcome.
          void cache.set(title, lang, summary).catch(() => {
            // Swallow cache write errors; the network result still
            // bubbles up to the caller successfully.
          });
        }
        return summary;
      } finally {
        cleanup();
      }
    });
  }

  async function fetchSummary(
    query: string,
    options: FetchSummaryOptions = {}
  ): Promise<WikipediaSummary | null> {
    if (typeof query !== "string" || query.trim().length === 0) {
      return null;
    }
    const userLang = mapLanguageCode(options.lang, defaultLang);
    const suffixes = options.suffixes ?? DEFAULT_SUFFIXES;
    const signal = options.signal;

    if (signal?.aborted) {
      throw buildAbortError(signal.reason);
    }

    // Try each suffix at the user's preferred language.
    for (const suffix of suffixes) {
      const result = await fetchSummaryAtLang(userLang, query + suffix, signal);
      if (result) return result;
    }

    // Langlinks-style fallback: if the user's language is non-English
    // and we got nothing, try English directly. We don't walk the
    // Action API langlinks endpoint (which would need `&origin=*`)
    // since for our use case the only fallback target is `en`, and
    // a direct REST summary call is simpler + cheaper than the
    // two-step langlinks dance.
    if (userLang !== DEFAULT_LANG) {
      for (const suffix of suffixes) {
        const result = await fetchSummaryAtLang(
          DEFAULT_LANG,
          query + suffix,
          signal
        );
        if (result) return result;
      }
    }

    return null;
  }

  return { fetchSummary };
}

/**
 * Module-default singleton. Atlas UI consumers (sub-track D
 * HygStarPanel) call `fetchSummary` directly through this.
 *
 * The default singleton wires the production IndexedDB cache
 * (`wikipediaCache`) so every read across the app benefits from
 * cross-session reuse. The cache is imported lazily (via the
 * top-of-file import) so test files that mock the singleton
 * before it instantiates can keep the cache out of their wires.
 */
export const wikipediaClient: WikipediaClient = createWikipediaClient({
  cache: defaultWikipediaCache,
});

export const fetchSummary = wikipediaClient.fetchSummary.bind(wikipediaClient);

export default wikipediaClient;
