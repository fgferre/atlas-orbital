import { describe, expect, it } from "vitest";

import {
  approachGridFade,
  computeGridFadeTarget,
  createGridFadeState,
  FADE_TIME_CONSTANT_S,
  GRID_RADIAL_REVEAL_ENABLED,
  radialRevealFactor,
  SCALE_DIP_DURATION_S,
  stepGridFade,
  type GridFadeInputs,
} from "./gridFade";

// The unified grid fade is the SINGLE source both GridRecursive (rings +
// spokes) and GridDecadeLabel (labels) read so the whole grid fades as one
// element. These tests lock the pure target/lerp logic so a regression in
// the fade can't silently leave the grid stuck invisible.

const READY: GridFadeInputs = {
  sceneReady: true,
  introActive: false,
  showGrid: true,
};

describe("computeGridFadeTarget — target from {sceneReady, introActive, showGrid}", () => {
  it("is 1 only when scene-ready AND intro not animating AND grid toggled on", () => {
    expect(computeGridFadeTarget(READY)).toBe(1);
  });

  it("is 0 before the scene-ready latch (hidden during boot)", () => {
    expect(computeGridFadeTarget({ ...READY, sceneReady: false })).toBe(0);
  });

  it("is 0 while the intro camera is actively flying in (hidden during intro)", () => {
    expect(computeGridFadeTarget({ ...READY, introActive: true })).toBe(0);
  });

  it("is 0 when the Grid toggle is off (the Layers switch fades it out)", () => {
    expect(computeGridFadeTarget({ ...READY, showGrid: false })).toBe(0);
  });

  it("is idempotent — recomputing the same inputs never changes the target", () => {
    const a = computeGridFadeTarget(READY);
    const b = computeGridFadeTarget(READY);
    expect(a).toBe(b);
  });
});

describe("approachGridFade — the lerp moves monotonically toward the target and clamps", () => {
  it("rises monotonically toward 1 and converges (never overshoots)", () => {
    let v = 0;
    let prev = -1;
    for (let i = 0; i < 200; i++) {
      const next = approachGridFade(v, 1, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(v); // monotone up
      expect(next).toBeLessThanOrEqual(1); // never overshoots
      prev = v;
      v = next;
    }
    expect(prev).toBeLessThan(v); // actually moved
    expect(v).toBeCloseTo(1, 2); // converged
  });

  it("falls monotonically toward 0 and converges", () => {
    let v = 1;
    for (let i = 0; i < 200; i++) {
      const next = approachGridFade(v, 0, 1 / 60);
      expect(next).toBeLessThanOrEqual(v); // monotone down
      expect(next).toBeGreaterThanOrEqual(0); // never undershoots
      v = next;
    }
    expect(v).toBeCloseTo(0, 2);
  });

  it("always clamps the result into [0,1] even for odd inputs", () => {
    expect(approachGridFade(2, 1, 1 / 60)).toBeLessThanOrEqual(1);
    expect(approachGridFade(-2, 0, 1 / 60)).toBeGreaterThanOrEqual(0);
    expect(approachGridFade(0.5, Number.NaN, 1 / 60)).toBeGreaterThanOrEqual(0);
  });

  it("holds (does not snap) on a degenerate frame delta", () => {
    expect(approachGridFade(0.3, 1, 0)).toBeCloseTo(0.3, 6);
    expect(approachGridFade(0.3, 1, -1)).toBeCloseTo(0.3, 6);
    expect(approachGridFade(0.3, 1, Number.NaN)).toBeCloseTo(0.3, 6);
  });

  it("approaches faster with a smaller time constant", () => {
    const slow = approachGridFade(0, 1, 1 / 60, FADE_TIME_CONSTANT_S * 4);
    const fast = approachGridFade(0, 1, 1 / 60, FADE_TIME_CONSTANT_S / 4);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe("stepGridFade — integrated per-frame advance", () => {
  it("fades IN from 0 toward 1 once ready (the initial reveal)", () => {
    const state = createGridFadeState();
    let last = state.value;
    expect(last).toBe(0); // starts hidden
    for (let i = 0; i < 120; i++) {
      const v = stepGridFade(state, READY, "didactic", 1 / 60, false);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(last).toBeCloseTo(1, 2);
  });

  it("reveals at rest WITHOUT requiring an intro-complete flag (regression guard)", () => {
    // The grid must NOT depend on the intro ever completing — only on the
    // scene-ready latch + intro not actively animating. This locks the fix
    // for the 'labels never appear' regression (the intro-complete flag was
    // observed to never flip on a normal boot).
    const state = createGridFadeState();
    // Scene ready, intro NOT animating (settled or skipped), grid on.
    for (let i = 0; i < 120; i++) {
      stepGridFade(
        state,
        { sceneReady: true, introActive: false, showGrid: true },
        "didactic",
        1 / 60,
        false
      );
    }
    expect(state.value).toBeCloseTo(1, 2); // visible at rest
  });

  it("stays at 0 while the scene is not ready (no premature reveal)", () => {
    const state = createGridFadeState();
    for (let i = 0; i < 60; i++) {
      stepGridFade(
        state,
        { sceneReady: false, introActive: true, showGrid: true },
        "didactic",
        1 / 60,
        false
      );
    }
    expect(state.value).toBeCloseTo(0, 4);
  });

  it("fades OUT toward 0 when the Grid toggle flips off", () => {
    const state = createGridFadeState();
    for (let i = 0; i < 120; i++) {
      stepGridFade(state, READY, "didactic", 1 / 60, false);
    }
    expect(state.value).toBeCloseTo(1, 2);
    // Toggle off → fades down.
    for (let i = 0; i < 120; i++) {
      stepGridFade(
        state,
        { ...READY, showGrid: false },
        "didactic",
        1 / 60,
        false
      );
    }
    expect(state.value).toBeCloseTo(0, 2);
  });

  it("reduced motion SNAPS to the target instead of fading", () => {
    const state = createGridFadeState();
    // One step at full ready with reducedMotion → immediately at 1.
    const v = stepGridFade(state, READY, "didactic", 1 / 60, true);
    expect(v).toBe(1);
    // Toggle off with reducedMotion → immediately 0.
    const v2 = stepGridFade(
      state,
      { ...READY, showGrid: false },
      "didactic",
      1 / 60,
      true
    );
    expect(v2).toBe(0);
  });

  it("does NOT dip on the very first frame (no boot flicker from mode init)", () => {
    const state = createGridFadeState();
    // First frame observes 'didactic'; lastScaleMode was null → no dip armed.
    stepGridFade(state, READY, "didactic", 1 / 60, false);
    expect(state.dipRemainingS).toBe(0);
  });

  it("scale-mode change DIPS the fade then RECOVERS (fade-through)", () => {
    const state = createGridFadeState();
    // Settle to full visible in didactic.
    for (let i = 0; i < 200; i++) {
      stepGridFade(state, READY, "didactic", 1 / 60, false);
    }
    expect(state.value).toBeCloseTo(1, 2);

    // Flip to realistic — arms the dip; target goes to 0 for the dip window.
    const afterFlip = stepGridFade(state, READY, "realistic", 1 / 60, false);
    expect(state.dipRemainingS).toBeGreaterThan(0);
    expect(afterFlip).toBeLessThan(1); // started dipping

    // Continue holding 'realistic' through the dip window → value sinks.
    let mid = afterFlip;
    const dipFrames = Math.ceil(SCALE_DIP_DURATION_S / (1 / 60)) + 2;
    for (let i = 0; i < dipFrames; i++) {
      mid = stepGridFade(state, READY, "realistic", 1 / 60, false);
    }
    expect(state.dipRemainingS).toBe(0); // dip elapsed
    expect(mid).toBeLessThan(afterFlip); // dipped down

    // Then it recovers back toward 1 under the new mode.
    let recovered = mid;
    for (let i = 0; i < 200; i++) {
      recovered = stepGridFade(state, READY, "realistic", 1 / 60, false);
    }
    expect(recovered).toBeCloseTo(1, 2);
  });

  it("reduced-motion scale-mode change snaps to 0 during the dip, then to 1", () => {
    const state = createGridFadeState();
    stepGridFade(state, READY, "didactic", 1 / 60, true);
    expect(state.value).toBe(1);
    // Flip mode under reduced motion → dip armed, snaps to 0 this frame.
    const dipped = stepGridFade(state, READY, "realistic", 1 / 60, true);
    expect(dipped).toBe(0);
  });

  it("rapid toggling is idempotent — re-entering the same target never glitches", () => {
    const state = createGridFadeState();
    for (let i = 0; i < 200; i++) {
      stepGridFade(state, READY, "didactic", 1 / 60, false);
    }
    const settled = state.value;
    expect(settled).toBeCloseTo(1, 2);
    // Hammer the same ready target many times — value must stay pinned ~1.
    for (let i = 0; i < 50; i++) {
      const v = stepGridFade(state, READY, "didactic", 1 / 60, false);
      expect(v).toBeGreaterThanOrEqual(settled - 1e-6);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("radialRevealFactor — optional outward bloom (gated off by default)", () => {
  it("is a no-op (always 1) while the reveal is disabled", () => {
    // The flourish ships dark; this guards that the default build does not
    // stagger ring opacity (the unified fade is the only multiplier).
    expect(GRID_RADIAL_REVEAL_ENABLED).toBe(false);
    for (const fade of [0, 0.3, 0.7, 1]) {
      for (let i = 0; i < 5; i++) {
        expect(radialRevealFactor(fade, i, 5)).toBe(1);
      }
    }
  });
});
