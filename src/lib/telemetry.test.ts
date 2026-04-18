import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setIsDevForTesting, telemetry } from "./telemetry";

describe("telemetry", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    __setIsDevForTesting(null);
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("suppresses info in production but logs it in development", () => {
    __setIsDevForTesting(false);
    telemetry.info("boot", "prod-silent");
    expect(infoSpy).not.toHaveBeenCalled();

    __setIsDevForTesting(true);
    telemetry.info("boot", "dev-loud");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("[boot] dev-loud");
  });

  it("always forwards error, in dev and in production", () => {
    __setIsDevForTesting(false);
    telemetry.error("error", "prod-error");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[error] prod-error");

    __setIsDevForTesting(true);
    telemetry.error("error", "dev-error");
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenLastCalledWith("[error] dev-error");
  });

  it("prefixes the message with the channel name in brackets", () => {
    __setIsDevForTesting(true);
    telemetry.warn("asset", "texture missing");
    expect(warnSpy).toHaveBeenCalledWith("[asset] texture missing");
  });

  it("passes the data object through as a second argument", () => {
    __setIsDevForTesting(true);
    const payload = { bodyId: "mars", jd: 2460000 };
    telemetry.info("perf", "cache stats", payload);
    expect(infoSpy).toHaveBeenCalledWith("[perf] cache stats", payload);

    // Error path receives data too, even in prod.
    __setIsDevForTesting(false);
    const err = new Error("boom");
    telemetry.error("error", "calc failed", { error: err });
    expect(errorSpy).toHaveBeenCalledWith("[error] calc failed", {
      error: err,
    });
  });

  it("keeps levels independent (info does not warn, warn does not info)", () => {
    __setIsDevForTesting(true);
    telemetry.info("boot", "i");
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    telemetry.warn("boot", "w");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
