import { describe, expect, it } from "vitest";

import { QUALITY_PROFILE_ORDER } from "./qualityProfile";
import { SUN_FX_PROFILES, shouldBakeCube } from "./sunFxProfile";

/**
 * W3/P-01's gate. Before this file, nothing in the suite referenced
 * `SUN_FX_PROFILES` or `cubeUpdateInterval` — the Perlin cubemap re-baked
 * every frame at 512² on the two top tiers and every gate stayed green.
 * These three asserts are the ones that would have caught it.
 */
describe("sun FX profile — cubemap bake schedule", () => {
  it("pins cubeUpdateInterval per tier, including the deliberate non-monotonicity", () => {
    expect(SUN_FX_PROFILES.ultra.cubeUpdateInterval).toBe(4);
    expect(SUN_FX_PROFILES.high.cubeUpdateInterval).toBe(4);
    expect(SUN_FX_PROFILES.balanced.cubeUpdateInterval).toBe(2);
    expect(SUN_FX_PROFILES.constrained.cubeUpdateInterval).toBe(3);

    // The top tiers bake at 7.1x balanced's fragment count, which is the
    // reason the stride is longer there rather than shorter. If someone
    // "restores monotonicity" they have to break one of these two.
    expect(SUN_FX_PROFILES.ultra.cubeResolution).toBe(512);
    expect(SUN_FX_PROFILES.balanced.cubeResolution).toBe(192);
  });

  it("bakes on frame 0 at every tier", () => {
    for (const tier of QUALITY_PROFILE_ORDER) {
      expect(shouldBakeCube(0, SUN_FX_PROFILES[tier].cubeUpdateInterval)).toBe(
        true
      );
    }
  });

  it("keeps the stride phase across a gap of frames spent out of render range", () => {
    const interval = SUN_FX_PROFILES.ultra.cubeUpdateInterval;

    // The counter advances unconditionally above the visibility
    // early-return, so a body that was invisible for frames 1..9 must not
    // resynchronise its bake to the frame it became visible again.
    const baked = [];
    for (let frame = 0; frame < 13; frame++) {
      if (shouldBakeCube(frame, interval)) baked.push(frame);
    }
    expect(baked).toEqual([0, 4, 8, 12]);
  });

  it("bakes every frame when the interval is 1 or degenerate", () => {
    expect(shouldBakeCube(7, 1)).toBe(true);
    // interval 0 would make the raw modulo NaN and silently never bake.
    expect(shouldBakeCube(7, 0)).toBe(true);
  });
});
