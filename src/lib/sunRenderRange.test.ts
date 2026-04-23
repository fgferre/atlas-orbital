import { describe, expect, it } from "vitest";

import {
  resolveSunRenderRange,
  SUN_BILLBOARD_THRESHOLD_AU,
  SUN_BILLBOARD_THRESHOLD_WORLD_UNITS,
} from "./sunRenderRange";

describe("sunRenderRange", () => {
  it("pins the AU threshold at 100 AU (post-Kuiper)", () => {
    expect(SUN_BILLBOARD_THRESHOLD_AU).toBe(100);
  });

  it("matches the world-unit conversion (1 AU = 1000 units)", () => {
    expect(SUN_BILLBOARD_THRESHOLD_WORLD_UNITS).toBe(
      SUN_BILLBOARD_THRESHOLD_AU * 1000
    );
  });

  it("returns 'close' inside the threshold", () => {
    expect(resolveSunRenderRange(0)).toBe("close");
    expect(resolveSunRenderRange(1_000)).toBe("close");
    expect(resolveSunRenderRange(40_000)).toBe("close");
  });

  it("returns 'close' AT the threshold (procedural Sun keeps the boundary)", () => {
    expect(resolveSunRenderRange(SUN_BILLBOARD_THRESHOLD_WORLD_UNITS)).toBe(
      "close"
    );
  });

  it("returns 'far' beyond the threshold", () => {
    expect(resolveSunRenderRange(SUN_BILLBOARD_THRESHOLD_WORLD_UNITS + 1)).toBe(
      "far"
    );
    expect(resolveSunRenderRange(1_000_000)).toBe("far");
  });
});
