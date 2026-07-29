import { describe, expect, it } from "vitest";

import {
  BASE_RESIDENT_LEVEL,
  estimateBodyBytes,
  estimateResidentTiles,
  levelResolution,
  monolithicBytes,
  selectTileLevel,
  tileBytes,
  tileCountForLevel,
  TILE_PX,
} from "./texturePyramid";

const MB = (bytes: number) => bytes / 1048576;

describe("tile pyramid geometry", () => {
  it("lands on the equirectangular tiers the app already ships", () => {
    // If the level maths did not reproduce 2k/4k/8k it would be inventing a
    // scale, and every memory number derived from it would be unmoored.
    expect(levelResolution(2)).toEqual({ width: 2048, height: 1024 });
    expect(levelResolution(3)).toEqual({ width: 4096, height: 2048 });
    expect(levelResolution(4)).toEqual({ width: 8192, height: 4096 });
  });

  it("picks the level that puts one texel on one pixel", () => {
    expect(selectTileLevel(128, 6)).toBe(0); // 512x256
    expect(selectTileLevel(1024, 6)).toBe(3); // 4096x2048
    expect(selectTileLevel(2048, 6)).toBe(4); // 8192x4096
  });

  it("clamps rather than running off either end of the pyramid", () => {
    expect(selectTileLevel(1, 6)).toBe(0);
    expect(selectTileLevel(1_000_000, 6)).toBe(6);
    expect(selectTileLevel(0, 6)).toBe(0);
    expect(selectTileLevel(Number.NaN, 6)).toBe(0);
  });
});

describe("resident memory under view-dependent streaming", () => {
  const VIEWPORT = { viewportWidthPx: 3840, viewportHeightPx: 2160 };

  it("stays flat as the camera closes in — the property the current loader lacks", () => {
    // Approach a planet: it grows on screen, so the level rises. Under a
    // monolithic texture that is a straight multiplication of cost. Under a
    // pyramid the visible surface shrinks by the same factor and the two
    // cancel, so resident bytes plateau.
    const costs = [256, 512, 1024, 2048, 4096].map((projectedRadiusPx) => {
      const level = selectTileLevel(projectedRadiusPx, 8);
      const { totalTiles } = estimateResidentTiles({
        ...VIEWPORT,
        projectedRadiusPx,
        level,
      });
      return { projectedRadiusPx, level, mb: MB(tileBytes(totalTiles)) };
    });

    // The level really is climbing — otherwise the plateau below is vacuous.
    expect(costs.map((c) => c.level)).toEqual([1, 2, 3, 4, 5]);

    const peak = Math.max(...costs.map((c) => c.mb));
    expect(
      peak,
      `resident MB by approach distance: ${costs
        .map((c) => `r=${c.projectedRadiusPx} L${c.level} ${c.mb.toFixed(1)}MB`)
        .join(", ")}`
    ).toBeLessThan(120);

    // And the last two steps — a 2x and 4x zoom — must not double anything.
    const [, , , third, fourth] = costs;
    expect(fourth.mb / third.mb).toBeLessThan(1.35);
  });

  it("beats the monolithic 8k a focused body loads today", () => {
    // Earth at ultra focus resolves five 8192x4096 channels. Measured in the
    // 2026-07-28 VRAM audit as 853.3 MB against a 512 MB budget.
    const monolithicPerChannel = monolithicBytes(8192, 4096);
    expect(MB(monolithicPerChannel * 5)).toBeCloseTo(853.3, 0);

    // Tile the map, cap the rest: Earth's four secondary channels stay 2k.
    const earth = estimateBodyBytes({
      ...VIEWPORT,
      projectedRadiusPx: 2048,
      maxLevel: 8,
      secondaryChannelCount: 4,
    });

    expect(earth.mapBytes).toBeLessThan(monolithicPerChannel);
    expect(
      MB(earth.totalBytes),
      `tiled Earth at the same view: ${MB(earth.totalBytes).toFixed(1)} MB (map ${MB(earth.mapBytes).toFixed(1)} + 4x2k ${MB(earth.secondaryBytes).toFixed(1)}) vs 853.3 MB monolithic`
    ).toBeLessThan(160);
  });

  it("keeps a whole-globe base so there is always something to draw", () => {
    // Without this a tile miss is a hole in the planet; with it, a miss is
    // merely blurry — the slippy-map behaviour.
    // L0 2x1=2, L1 4x2=8, L2 8x4=32 -> 42 tiles, ~14 MB for a whole globe.
    const base = [0, 1, 2].reduce((sum, l) => sum + tileCountForLevel(l), 0);
    expect(base).toBe(42);
    expect(MB(tileBytes(base))).toBeLessThan(16);

    const { baseTiles } = estimateResidentTiles({
      ...VIEWPORT,
      projectedRadiusPx: 4096,
      level: selectTileLevel(4096, 8),
    });
    expect(baseTiles).toBe(base);
    expect(BASE_RESIDENT_LEVEL).toBe(2);
  });

  it("does not pay for detail on a body that is a few pixels wide", () => {
    // The overview band is most of the scene most of the time.
    const level = selectTileLevel(24, 8);
    const { totalTiles } = estimateResidentTiles({
      ...VIEWPORT,
      projectedRadiusPx: 24,
      level,
    });
    expect(level).toBe(0);
    expect(MB(tileBytes(totalTiles))).toBeLessThan(2);
  });

  it("uses a tile size a browser will not choke on", () => {
    expect(TILE_PX).toBe(256);
    expect(MB(tileBytes(1))).toBeLessThan(0.5);
  });
});
