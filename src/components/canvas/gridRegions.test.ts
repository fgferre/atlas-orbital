import { describe, expect, it } from "vitest";

import { GRID_REGIONS, selectVisibleRegions } from "./gridRegions";

describe("GRID_REGIONS", () => {
  it("holds the published distances, ordered outward", () => {
    // Contract, not decoration: these are the numbers the labels claim, so
    // a silent edit here is a silent factual change on screen.
    expect(GRID_REGIONS.map((r) => r.au)).toEqual([1, 2.7, 40, 120]);
    const aus = GRID_REGIONS.map((r) => r.au);
    expect([...aus].sort((a, b) => a - b)).toEqual(aus);
  });
});

describe("selectVisibleRegions", () => {
  it("keeps regions inside the view and drops the rest", () => {
    expect(selectVisibleRegions(5).map((r) => r.label)).toEqual([
      "Earth's orbit",
      "Asteroid belt",
    ]);
    expect(selectVisibleRegions(200).map((r) => r.label)).toContain(
      "Heliopause"
    );
  });

  it("drops regions that have collapsed into the Sun at wide extents", () => {
    // At an interstellar extent every solar-system region is a speck on the
    // Sun glyph — including the heliopause, which is only 120 AU. Naming
    // any of them there would be a label pointing at a single pixel.
    expect(selectVisibleRegions(100_000)).toEqual([]);
    // One decade in, the outermost region is legitimately readable again.
    expect(selectVisibleRegions(2_000).map((r) => r.label)).toEqual([
      "Kuiper belt",
      "Heliopause",
    ]);
  });

  it("returns nothing for a degenerate extent instead of throwing", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(selectVisibleRegions(bad)).toEqual([]);
    }
  });
});
