import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";
import {
  StellarFlightTransition,
  type StellarFlightSpec,
} from "./StellarFlightTransition";

/**
 * T6.4-M2.5 S3 — tests for `StellarFlightTransition`.
 *
 * Uses Vitest's fake timers + `vi.useFakeTimers` controlling
 * `performance.now()` so we can advance the clock deterministically
 * without flaky `setTimeout`-based waits.
 */

const linear = (t: number): number => t;

const makeSpec = (
  overrides: Partial<StellarFlightSpec> = {}
): StellarFlightSpec => ({
  startPos: new THREE.Vector3(0, 0, 0),
  endPos: new THREE.Vector3(100, 0, 0),
  startTarget: new THREE.Vector3(0, 0, -1),
  endTarget: new THREE.Vector3(50, 0, 0),
  posDurationMs: 1000,
  oriDurationMs: 500,
  posEasing: linear,
  oriEasing: linear,
  ...overrides,
});

describe("StellarFlightTransition — start + update lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null before start()", () => {
    const t = new StellarFlightTransition();
    expect(t.update()).toBeNull();
    expect(t.isActive).toBe(false);
  });

  it("returns initial position + target at t=0", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec());
    const f = t.update();
    expect(f).not.toBeNull();
    expect(f!.position.x).toBeCloseTo(0);
    expect(f!.target.x).toBeCloseTo(0);
    expect(f!.target.z).toBeCloseTo(-1);
    expect(f!.done).toBe(false);
    expect(t.isActive).toBe(true);
  });

  it("position channel reaches end at t=posDurationMs (linear easing)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000, oriDurationMs: 500 }));
    vi.advanceTimersByTime(1000);
    const f = t.update();
    expect(f).not.toBeNull();
    expect(f!.position.x).toBeCloseTo(100, 6);
    expect(f!.target.x).toBeCloseTo(50, 6);
    // Both channels are at alpha=1 by 1000ms (ori already done at
    // 500ms); transition is done.
    expect(f!.done).toBe(true);
    expect(t.isActive).toBe(false);
  });

  it("orientation channel completes BEFORE position when oriDurationMs < posDurationMs", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000, oriDurationMs: 500 }));
    vi.advanceTimersByTime(500);
    const f = t.update();
    expect(f).not.toBeNull();
    // Position halfway, orientation fully arrived.
    expect(f!.position.x).toBeCloseTo(50, 6);
    expect(f!.target.x).toBeCloseTo(50, 6);
    // Not done yet — position channel still running.
    expect(f!.done).toBe(false);
    expect(t.isActive).toBe(true);
  });

  it("does NOT report done until BOTH channels finish", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 2000, oriDurationMs: 100 }));
    // Orientation completes at 100ms.
    vi.advanceTimersByTime(100);
    expect(t.update()!.done).toBe(false);
    // Position at 50% (t=1000ms).
    vi.advanceTimersByTime(900);
    expect(t.update()!.done).toBe(false);
    // Position at 100% (t=2000ms).
    vi.advanceTimersByTime(1000);
    const f = t.update();
    expect(f!.done).toBe(true);
    expect(t.isActive).toBe(false);
  });

  it("clamps alpha to 1 even when elapsed time exceeds duration", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100, oriDurationMs: 100 }));
    vi.advanceTimersByTime(5000);
    const f = t.update();
    expect(f!.position.x).toBeCloseTo(100, 6);
    expect(f!.target.x).toBeCloseTo(50, 6);
    expect(f!.done).toBe(true);
  });

  it("returns null on update() after natural completion", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100, oriDurationMs: 100 }));
    vi.advanceTimersByTime(200);
    expect(t.update()!.done).toBe(true);
    // Subsequent updates return null since the transition is no
    // longer active.
    expect(t.update()).toBeNull();
  });
});

describe("StellarFlightTransition — onComplete callback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires exactly once when both channels finish", () => {
    const onComplete = vi.fn();
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100, oriDurationMs: 100, onComplete }));

    // Mid-flight: not yet.
    vi.advanceTimersByTime(50);
    t.update();
    expect(onComplete).not.toHaveBeenCalled();

    // Completion frame: fires.
    vi.advanceTimersByTime(50);
    t.update();
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Subsequent update() is a no-op (returns null), no extra
    // callback fire.
    t.update();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when cancelled mid-flight", () => {
    const onComplete = vi.fn();
    const t = new StellarFlightTransition();
    t.start(makeSpec({ onComplete }));
    vi.advanceTimersByTime(300);
    t.cancel();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does NOT fire when cancelled AFTER both durations have elapsed (Codex 2026-05-05 P2)", () => {
    // Regression pin: prior cancel() delegated to update() which
    // fired onComplete whenever both alphas were ≥ 1. If the user
    // interrupted in the gap between durations elapsing and the
    // next animation frame consuming completion, the interrupt
    // path would execute completion side-effects despite
    // semantically NOT being a natural completion.
    const onComplete = vi.fn();
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100, oriDurationMs: 100, onComplete }));
    // Advance well past both durations WITHOUT calling update() —
    // simulates the user clicking faster than the next RAF tick.
    vi.advanceTimersByTime(500);
    expect(onComplete).not.toHaveBeenCalled();
    const frozen = t.cancel();
    // cancel() must return the at-end state (alphas clamped) but
    // NOT fire onComplete.
    expect(frozen).not.toBeNull();
    expect(frozen!.position.x).toBeCloseTo(100, 6);
    expect(frozen!.target.x).toBeCloseTo(50, 6);
    expect(onComplete).not.toHaveBeenCalled();
    expect(t.isActive).toBe(false);
  });
});

describe("StellarFlightTransition — cancel() interrupt path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when cancelled with no active transition", () => {
    const t = new StellarFlightTransition();
    expect(t.cancel()).toBeNull();
  });

  it("returns the intermediate position + target at the freeze moment", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000, oriDurationMs: 500 }));
    vi.advanceTimersByTime(250);
    const frozen = t.cancel();
    expect(frozen).not.toBeNull();
    // Position at alpha=0.25: 25 wu out of 100.
    expect(frozen!.position.x).toBeCloseTo(25, 6);
    // Orientation at alpha=0.5 (250ms / 500ms): 25 wu of the
    // 50-wu target lerp = 25.
    expect(frozen!.target.x).toBeCloseTo(25, 6);
    expect(t.isActive).toBe(false);
  });

  it("subsequent update() after cancel returns null", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec());
    vi.advanceTimersByTime(100);
    t.cancel();
    expect(t.update()).toBeNull();
  });

  it("can re-start after cancel cleanly", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000 }));
    vi.advanceTimersByTime(300);
    t.cancel();
    // Re-start with a different spec.
    t.start(
      makeSpec({
        startPos: new THREE.Vector3(50, 0, 0),
        endPos: new THREE.Vector3(150, 0, 0),
        posDurationMs: 200,
        oriDurationMs: 200,
      })
    );
    const f = t.update();
    expect(f).not.toBeNull();
    expect(f!.position.x).toBeCloseTo(50, 6);
    expect(t.isActive).toBe(true);
  });
});

describe("StellarFlightTransition — easing channels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("default easing is logisticSigmoid (S2)", () => {
    const t = new StellarFlightTransition();
    t.start(
      makeSpec({
        posDurationMs: 1000,
        oriDurationMs: 1000,
        // Omit easings → defaults apply.
        posEasing: undefined,
        oriEasing: undefined,
      })
    );
    vi.advanceTimersByTime(500);
    const f = t.update();
    // logisticSigmoid(0.5) ≈ 0.5 (symmetric S-curve), so position
    // at midpoint sits near 50 (out of 100).
    expect(f!.position.x).toBeCloseTo(
      100 * CameraTransition.logisticSigmoid(0.5),
      6
    );
  });

  it("position and orientation channels use independent easings", () => {
    // Position uses linear; orientation uses logisticSigmoid.
    const t = new StellarFlightTransition();
    t.start(
      makeSpec({
        posDurationMs: 1000,
        oriDurationMs: 1000,
        posEasing: linear,
        oriEasing: CameraTransition.logisticSigmoid,
      })
    );
    vi.advanceTimersByTime(300);
    const f = t.update();
    // Position at linear alpha=0.3 → 30 wu.
    expect(f!.position.x).toBeCloseTo(30, 6);
    // Orientation at logisticSigmoid(0.3) ≈ 0.0025 with the
    // round-5 default factor=60 (Gaia-faithful) — heavy stall in
    // the first 30% of the duration is the intended "lift-off"
    // departure phase. Computing both sides via the same default
    // ensures the test is decoupled from the factor choice.
    const oriAlpha = CameraTransition.logisticSigmoid(0.3);
    expect(f!.target.x).toBeCloseTo(50 * oriAlpha, 6);
  });

  it("zero-duration channels resolve to alpha=1 immediately", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 0, oriDurationMs: 0 }));
    const f = t.update();
    // Both channels jump straight to end values; transition is done.
    expect(f!.position.x).toBeCloseTo(100, 6);
    expect(f!.target.x).toBeCloseTo(50, 6);
    expect(f!.done).toBe(true);
  });
});

describe("StellarFlightTransition — posProgressRaw (S6 pre-warm signal)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when transition is inactive (pre-start)", () => {
    const t = new StellarFlightTransition();
    expect(t.posProgressRaw).toBe(0);
  });

  it("returns 0 immediately after start (elapsed=0)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000 }));
    expect(t.posProgressRaw).toBe(0);
  });

  it("scales linearly with elapsed time (raw, NOT eased)", () => {
    const t = new StellarFlightTransition();
    t.start(
      makeSpec({
        posDurationMs: 1000,
        posEasing: CameraTransition.logisticSigmoid,
      })
    );
    vi.advanceTimersByTime(700);
    // Raw alpha = 700/1000 = 0.7 regardless of easing.
    expect(t.posProgressRaw).toBeCloseTo(0.7, 6);
  });

  it("clamps to 1 once elapsed exceeds duration", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100 }));
    vi.advanceTimersByTime(5000);
    expect(t.posProgressRaw).toBe(1);
  });

  it("returns 1 when posDurationMs is 0 (degenerate spec)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 0 }));
    expect(t.posProgressRaw).toBe(1);
  });

  it("returns 0 after natural completion (active flag flipped)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 100, oriDurationMs: 100 }));
    vi.advanceTimersByTime(200);
    t.update();
    expect(t.isActive).toBe(false);
    // Post-completion: getter returns 0 (no active fly-to).
    expect(t.posProgressRaw).toBe(0);
  });

  it("returns 0 after cancel (active flag flipped)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000 }));
    vi.advanceTimersByTime(400);
    t.cancel();
    expect(t.posProgressRaw).toBe(0);
  });

  it("crosses HYG_FLIGHT_PREWARM_THRESHOLD (0.70) at 70 % of posDurationMs", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec({ posDurationMs: 1000 }));
    vi.advanceTimersByTime(699);
    expect(t.posProgressRaw < 0.7).toBe(true);
    vi.advanceTimersByTime(2);
    // 701 ms elapsed → 0.701 raw.
    expect(t.posProgressRaw >= 0.7).toBe(true);
  });
});

describe("StellarFlightTransition — vector reuse (no per-frame allocation)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the same Vector3 instances across update() calls (steady-state alloc-free)", () => {
    const t = new StellarFlightTransition();
    t.start(makeSpec());
    vi.advanceTimersByTime(100);
    const f1 = t.update();
    vi.advanceTimersByTime(100);
    const f2 = t.update();
    expect(f1).not.toBeNull();
    expect(f2).not.toBeNull();
    expect(f1!.position).toBe(f2!.position);
    expect(f1!.target).toBe(f2!.target);
  });
});
