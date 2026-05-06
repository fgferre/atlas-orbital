import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  createWikipediaClient,
  mapLanguageCode,
  type FetchSummaryOptions,
  type WikipediaClient,
} from "./wikipediaClient";

const SUMMARY_OK = {
  type: "standard",
  title: "Sirius",
  extract:
    "Sirius is the brightest star in the night sky, located in the constellation Canis Major.",
  thumbnail: { source: "https://upload.wikimedia.org/sirius.jpg" },
  content_urls: {
    desktop: { page: "https://en.wikipedia.org/wiki/Sirius" },
  },
};

const SUMMARY_PT = {
  ...SUMMARY_OK,
  title: "Sirius (estrela)",
  extract:
    "Sirius é a estrela mais brilhante do céu noturno, localizada na constelação de Cão Maior.",
  content_urls: {
    desktop: { page: "https://pt.wikipedia.org/wiki/Sirius_(estrela)" },
  },
};

const buildJsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : `STATUS ${status}`,
    headers: { "Content-Type": "application/json" },
  });

const build404 = (): Response =>
  new Response("Not Found", { status: 404, statusText: "Not Found" });

describe("mapLanguageCode", () => {
  it("maps explicit Atlas locales to Wikipedia 2-letter codes", () => {
    expect(mapLanguageCode("pt-BR")).toBe("pt");
    expect(mapLanguageCode("pt-PT")).toBe("pt");
    expect(mapLanguageCode("en-US")).toBe("en");
    expect(mapLanguageCode("en-GB")).toBe("en");
  });

  it("returns 2-letter base for unknown regional tags", () => {
    expect(mapLanguageCode("es-AR")).toBe("es");
    expect(mapLanguageCode("ja-JP")).toBe("ja");
  });

  it("returns the input as-is when it's already a 2-letter code", () => {
    expect(mapLanguageCode("en")).toBe("en");
    expect(mapLanguageCode("pt")).toBe("pt");
  });

  it("falls back to the configured default for empty / non-string input", () => {
    expect(mapLanguageCode("")).toBe("en");
    expect(mapLanguageCode(null)).toBe("en");
    expect(mapLanguageCode(undefined)).toBe("en");
    expect(mapLanguageCode("", "pt")).toBe("pt");
  });

  it("is case-insensitive on the input", () => {
    expect(mapLanguageCode("PT-BR")).toBe("pt");
    expect(mapLanguageCode("EN")).toBe("en");
  });
});

describe("createWikipediaClient — fetchSummary basics", () => {
  let client: WikipediaClient;
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchSpy = vi.fn();
    client = createWikipediaClient({
      fetchImpl: fetchSpy as unknown as typeof fetch,
      requestWaitMs: 1000,
      requestTimeoutMs: 15_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the parsed summary on 200 OK", async () => {
    fetchSpy.mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const promise = client.fetchSummary("Sirius");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      title: "Sirius",
      extract: SUMMARY_OK.extract,
      thumbnailUrl: "https://upload.wikimedia.org/sirius.jpg",
      pageUrl: "https://en.wikipedia.org/wiki/Sirius",
      language: "en",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    // Default suffix order is `_(star)` first.
    expect(url).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Sirius_(star)"
    );
    expect(init?.headers).toMatchObject({
      "Api-User-Agent": expect.stringContaining("atlas-orbital/"),
    });
  });

  it("URL-encodes spaces and special chars in the title", async () => {
    fetchSpy.mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const promise = client.fetchSummary("Proxima Centauri", {
      suffixes: [""],
    });
    await vi.runAllTimersAsync();
    await promise;

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(
      "https://en.wikipedia.org/api/rest_v1/page/summary/Proxima_Centauri"
    );
  });

  it("returns null when the response is a disambiguation page", async () => {
    fetchSpy.mockResolvedValueOnce(
      buildJsonResponse(200, {
        ...SUMMARY_OK,
        type: "disambiguation",
      })
    );

    const promise = client.fetchSummary("Sirius", { suffixes: [""] });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when the response has no extract", async () => {
    fetchSpy.mockResolvedValueOnce(
      buildJsonResponse(200, { ...SUMMARY_OK, extract: "" })
    );

    const promise = client.fetchSummary("Sirius", { suffixes: [""] });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null for empty or whitespace-only queries without firing fetch", async () => {
    expect(await client.fetchSummary("")).toBeNull();
    expect(await client.fetchSummary("   ")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on non-404 / non-200 statuses", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Server error", { status: 500, statusText: "Server Error" })
    );

    let caught: unknown;
    const promise = client
      .fetchSummary("Sirius", { suffixes: [""] })
      .catch((err) => {
        caught = err;
      });
    await vi.runAllTimersAsync();
    await promise;
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/500/);
  });
});

describe("createWikipediaClient — suffix disambiguation", () => {
  let client: WikipediaClient;
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchSpy = vi.fn();
    client = createWikipediaClient({
      fetchImpl: fetchSpy as unknown as typeof fetch,
      requestWaitMs: 0, // disable wait for these tests
      requestTimeoutMs: 15_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tries the first suffix, falls through to subsequent ones on 404", async () => {
    fetchSpy
      .mockResolvedValueOnce(build404())
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const promise = client.fetchSummary("Sirius", {
      suffixes: ["_(star)", ""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map((call) => call[0]);
    expect(urls[0]).toContain("Sirius_(star)");
    expect(urls[1]).toContain("Sirius");
    expect(urls[1]).not.toContain("(star)");
  });

  it("returns null when every suffix is 404", async () => {
    fetchSpy.mockResolvedValue(build404());

    const promise = client.fetchSummary("Sirius", {
      suffixes: ["_(star)", ""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("createWikipediaClient — language mapping + langlinks fallback", () => {
  let client: WikipediaClient;
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchSpy = vi.fn();
    client = createWikipediaClient({
      fetchImpl: fetchSpy as unknown as typeof fetch,
      requestWaitMs: 0,
      requestTimeoutMs: 15_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("composes a pt.wikipedia.org URL when lang is pt-BR", async () => {
    fetchSpy.mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_PT));

    const promise = client.fetchSummary("Sirius", {
      lang: "pt-BR",
      suffixes: [""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.language).toBe("pt");
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(
      "https://pt.wikipedia.org/api/rest_v1/page/summary/Sirius"
    );
  });

  it("falls back to en.wikipedia.org when the pt page returns 404 across all suffixes", async () => {
    fetchSpy
      // pt: both suffixes 404
      .mockResolvedValueOnce(build404())
      .mockResolvedValueOnce(build404())
      // en: first suffix 200
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const promise = client.fetchSummary("Sirius", {
      lang: "pt-BR",
      suffixes: ["_(star)", ""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).not.toBeNull();
    expect(result?.language).toBe("en");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const urls = fetchSpy.mock.calls.map((call) => call[0]);
    expect(urls[0]).toContain("pt.wikipedia.org");
    expect(urls[1]).toContain("pt.wikipedia.org");
    expect(urls[2]).toContain("en.wikipedia.org");
  });

  it("does NOT trigger English fallback when the user's lang is already English", async () => {
    fetchSpy.mockResolvedValue(build404());

    const promise = client.fetchSummary("Sirius", {
      lang: "en",
      suffixes: ["_(star)", ""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    // Two pt suffixes, no en fallback — total 2.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns null when both pt and en are 404", async () => {
    fetchSpy.mockResolvedValue(build404());

    const promise = client.fetchSummary("UnknownStar", {
      lang: "pt-BR",
      suffixes: ["_(star)", ""],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    // 2 pt + 2 en = 4 calls total.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});

describe("createWikipediaClient — request serialization (sleep-remaining math)", () => {
  let client: WikipediaClient;
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchSpy = vi.fn();
    client = createWikipediaClient({
      fetchImpl: fetchSpy as unknown as typeof fetch,
      requestWaitMs: 1000,
      requestTimeoutMs: 15_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first request fires immediately (no prior request)", async () => {
    fetchSpy.mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const promise = client.fetchSummary("Sirius", { suffixes: [""] });
    // Yield microtasks so the queued continuation can dispatch the
    // fetch without waiting on any timer.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    await promise;
  });

  it("two concurrent requests serialize 1000 ms apart", async () => {
    fetchSpy
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK))
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const p1 = client.fetchSummary("Sirius", { suffixes: [""] });
    const p2 = client.fetchSummary("Vega", { suffixes: [""] });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Before 1000 ms have elapsed since request #1, request #2 stays
    // queued.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After total 1000 ms, request #2 fires.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);
  });

  it("sleeps the REMAINING wait, not the elapsed (Codex round-5b correction over Gaia's math)", async () => {
    fetchSpy
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK))
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const p1 = client.fetchSummary("Sirius", { suffixes: [""] });
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();
    await p1;

    // Now advance the clock ~300 ms and fire request #2.
    await vi.advanceTimersByTimeAsync(300);
    const p2 = client.fetchSummary("Vega", { suffixes: [""] });

    // Wikipedia's per-tab limit allows the next request 700 ms after
    // request #1's start. Gaia's `Thread.sleep(elapsed)` would have
    // slept 300 ms here (total spacing = 600 ms — under the limit).
    // Atlas's sleep-remaining math sleeps 700 ms instead.
    await vi.advanceTimersByTimeAsync(699);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    await p2;
  });

  it("does NOT introduce extra spacing when the previous request finished long ago", async () => {
    fetchSpy
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK))
      .mockResolvedValueOnce(buildJsonResponse(200, SUMMARY_OK));

    const p1 = client.fetchSummary("Sirius", { suffixes: [""] });
    await vi.runAllTimersAsync();
    await p1;

    // 5 seconds elapse before the next request.
    await vi.advanceTimersByTimeAsync(5_000);

    const p2 = client.fetchSummary("Vega", { suffixes: [""] });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await vi.runAllTimersAsync();
    await p2;
  });
});

describe("createWikipediaClient — abort + timeout", () => {
  let client: WikipediaClient;
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    fetchSpy = vi.fn();
    client = createWikipediaClient({
      fetchImpl: fetchSpy as unknown as typeof fetch,
      requestWaitMs: 0,
      requestTimeoutMs: 15_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with the caller's reason when the signal aborts before fetch starts", async () => {
    const ac = new AbortController();
    ac.abort(new DOMException("Canceled by user", "AbortError"));

    const opts: FetchSummaryOptions = { signal: ac.signal, suffixes: [""] };
    await expect(client.fetchSummary("Sirius", opts)).rejects.toThrow(
      /Canceled by user/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards the caller's signal to fetch so an in-flight abort cancels it", async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchSpy.mockImplementation(((
      _url: string,
      init: RequestInit | undefined
    ) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener(
          "abort",
          () => {
            reject(capturedSignal?.reason ?? new Error("aborted"));
          },
          { once: true }
        );
      });
    }) as unknown as typeof fetch);

    const ac = new AbortController();
    const promise = client.fetchSummary("Sirius", {
      signal: ac.signal,
      suffixes: [""],
    });
    // Attach a catch-all so the rejection is observed regardless of
    // when the test's await runs — avoids vitest reporting an
    // unhandled-rejection that races our explicit catch.
    let caught: unknown;
    promise.catch((err) => {
      caught = err;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    ac.abort(new DOMException("Stop", "AbortError"));
    await vi.runAllTimersAsync();
    // Drain the rejected promise via the catch we already attached.
    await Promise.resolve();
    await Promise.resolve();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/Stop/);
  });

  it("aborts with TimeoutError after requestTimeoutMs", async () => {
    let captured: AbortSignal | undefined;
    fetchSpy.mockImplementation(((
      _url: string,
      init: RequestInit | undefined
    ) => {
      captured = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        captured?.addEventListener(
          "abort",
          () => {
            reject(captured?.reason ?? new Error("aborted"));
          },
          { once: true }
        );
      });
    }) as unknown as typeof fetch);

    let caught: unknown;
    const promise = client
      .fetchSummary("Sirius", { suffixes: [""] })
      .catch((err) => {
        caught = err;
      });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15_000);
    await promise;
    expect(caught).toBeInstanceOf(DOMException);
    expect((caught as DOMException).name).toBe("TimeoutError");
  });
});
