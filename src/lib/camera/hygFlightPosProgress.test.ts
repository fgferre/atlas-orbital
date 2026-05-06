import { beforeEach, describe, expect, it } from "vitest";

import {
  HYG_FLIGHT_PREWARM_THRESHOLD,
  __resetHygFlightPosProgress,
  getHygFlightPosProgress,
  setHygFlightPosProgress,
} from "./hygFlightPosProgress";

/**
 * T6.4-M2.5 S6 — tests for the HYG fly-to position-channel progress
 * singleton. Producer (CameraController.useFrame) writes; consumer
 * (HygStellarMesh.useFrame) reads. The contract:
 *
 *   - `null` means "no HYG fly-to active" → consumer falls through.
 *   - `[0, 1]` is the position-channel raw alpha during a fly-to.
 *   - Out-of-range / non-finite inputs clamp or reset to null
 *     defensively (the contract is `[0, 1]` but a producer with
 *     rounding error shouldn't break the consumer).
 */

describe("hygFlightPosProgress singleton", () => {
  beforeEach(() => {
    __resetHygFlightPosProgress();
  });

  it("returns null before any write", () => {
    expect(getHygFlightPosProgress()).toBeNull();
  });

  it("round-trips a numeric value", () => {
    setHygFlightPosProgress(0.42);
    expect(getHygFlightPosProgress()).toBe(0.42);
  });

  it("clears via explicit null", () => {
    setHygFlightPosProgress(0.5);
    setHygFlightPosProgress(null);
    expect(getHygFlightPosProgress()).toBeNull();
  });

  it("clamps values below 0 to 0", () => {
    setHygFlightPosProgress(-0.1);
    expect(getHygFlightPosProgress()).toBe(0);
  });

  it("clamps values above 1 to 1", () => {
    setHygFlightPosProgress(1.1);
    expect(getHygFlightPosProgress()).toBe(1);
  });

  it("treats NaN as null (defensive against producer errors)", () => {
    setHygFlightPosProgress(0.5);
    setHygFlightPosProgress(Number.NaN);
    expect(getHygFlightPosProgress()).toBeNull();
  });

  it("treats Infinity as null (defensive against producer errors)", () => {
    setHygFlightPosProgress(0.5);
    setHygFlightPosProgress(Number.POSITIVE_INFINITY);
    expect(getHygFlightPosProgress()).toBeNull();
  });

  it("preserves the most recent successful write across reads", () => {
    setHygFlightPosProgress(0.3);
    expect(getHygFlightPosProgress()).toBe(0.3);
    expect(getHygFlightPosProgress()).toBe(0.3);
    setHygFlightPosProgress(0.6);
    expect(getHygFlightPosProgress()).toBe(0.6);
  });

  it("test-only reset escape hatch clears state", () => {
    setHygFlightPosProgress(0.9);
    __resetHygFlightPosProgress();
    expect(getHygFlightPosProgress()).toBeNull();
  });
});

describe("HYG_FLIGHT_PREWARM_THRESHOLD", () => {
  it("is in (0, 1)", () => {
    expect(HYG_FLIGHT_PREWARM_THRESHOLD).toBeGreaterThan(0);
    expect(HYG_FLIGHT_PREWARM_THRESHOLD).toBeLessThan(1);
  });

  it("is the documented 0.70 cue (deceleration tail of the position channel)", () => {
    // Pin the value so a future tweak shows up in the diff. 0.70
    // corresponds to ~99.75 % of the straight-line camera travel
    // under the post-round-5 default `logisticSigmoid(factor=60)`
    // easing — the M3 cross-fade is expected to ramp across this
    // threshold. See module header comment in `hygFlightPosProgress.ts`.
    expect(HYG_FLIGHT_PREWARM_THRESHOLD).toBe(0.7);
  });
});
