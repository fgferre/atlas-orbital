import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveOrbitalResult } from "./useOrbitalEngine";

/**
 * These tests exercise the pure helper that the hooks compose around
 * `useMemo`. Because the project's vitest environment is `node`, we
 * cannot render React components here — but the discriminated-union
 * wrapping logic lives in `resolveOrbitalResult`, which the hooks
 * delegate to. Covering the helper covers the same behavior.
 */
describe("resolveOrbitalResult", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns { state: 'ready', data } on success", () => {
    const data = { value: 42 };
    const result = resolveOrbitalResult("test", () => data);
    expect(result).toEqual({ state: "ready", data });
  });

  it("returns { state: 'error', error } on thrown Error", () => {
    const err = new Error("no provider for body");
    const result = resolveOrbitalResult("useOrbitalCalculation:xyz", () => {
      throw err;
    });
    expect(result.state).toBe("error");
    if (result.state === "error") {
      expect(result.error).toBe(err);
    }
    // Error is still logged for dev visibility.
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("coerces non-Error throws into Error instances", () => {
    const result = resolveOrbitalResult("test", () => {
      throw "string boom";
    });
    expect(result.state).toBe("error");
    if (result.state === "error") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string boom");
    }
  });

  it("tags the log with the provided label", () => {
    resolveOrbitalResult("useOrbitalPosition:mars", () => {
      throw new Error("boom");
    });
    const firstArg = consoleErrorSpy.mock.calls[0]?.[0];
    expect(String(firstArg)).toContain("useOrbitalPosition:mars");
  });
});
