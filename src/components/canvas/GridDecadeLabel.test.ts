import { describe, expect, it } from "vitest";

import {
  AU_PER_LY,
  formatDecadeScaleLabel,
  GRID_DECADE_MAX,
  GRID_DECADE_MIN,
} from "./shaders/gridRecScaling";

/**
 * The flat AU DISTANCE label's value formatting for the concentric ring
 * grid (redesign 2026-06-18). The label value is the dominant visible
 * ring's AU, grouped + unit-switched to light-years at realistic stellar
 * scale. These assert the exact rendered strings across the ring AU range
 * the grid drives, plus the AU→LY boundary, the sub-AU regime, and
 * robustness.
 */

describe("formatDecadeScaleLabel — AU regime (sub-light-year)", () => {
  it("groups thousands with a space, no decimals (≥ 1 AU)", () => {
    expect(formatDecadeScaleLabel(1)).toBe("1 AU");
    expect(formatDecadeScaleLabel(10)).toBe("10 AU");
    expect(formatDecadeScaleLabel(100)).toBe("100 AU");
    expect(formatDecadeScaleLabel(1000)).toBe("1 000 AU");
    expect(formatDecadeScaleLabel(10000)).toBe("10 000 AU");
  });

  it("renders sub-AU rings (inner-planet decade) with a fractional digit", () => {
    // The ring grid's finest decade is 0.1 AU (GRID_DECADE_MIN = -1).
    expect(formatDecadeScaleLabel(0.1)).toBe("0.1 AU");
    expect(formatDecadeScaleLabel(0.5)).toBe("0.5 AU");
  });

  it("covers each power-of-ten the grid can drive (10^MIN..MAX)", () => {
    const expected: Record<number, string> = {
      [-1]: "0.1 AU",
      0: "1 AU",
      1: "10 AU",
      2: "100 AU",
      3: "1 000 AU",
      4: "10 000 AU",
    };
    for (let decade = GRID_DECADE_MIN; decade <= GRID_DECADE_MAX; decade++) {
      const au = Math.pow(10, decade);
      if (au < AU_PER_LY) {
        expect(formatDecadeScaleLabel(au)).toBe(expected[decade]);
      }
    }
  });
});

describe("formatDecadeScaleLabel — LY regime (stellar → galactic)", () => {
  it("auto-switches to light-years at and beyond 1 LY", () => {
    expect(formatDecadeScaleLabel(AU_PER_LY)).toBe("1 LY");
    // 10^5 AU ≈ 1.5812 LY.
    expect(formatDecadeScaleLabel(1e5)).toBe("1.6 LY");
  });

  it("formats the GALACTIC decade ladder as clean rounded LY (no garbage)", () => {
    // The realistic ladder runs 10^5..10^10 AU. Each must read as a tidy
    // grouped LY integer — never a raw "63241.077"-style value.
    expect(formatDecadeScaleLabel(1e6)).toBe("16 LY"); // 1e6/63241 ≈ 15.8
    expect(formatDecadeScaleLabel(1e7)).toBe("158 LY");
    expect(formatDecadeScaleLabel(1e8)).toBe("1 581 LY");
    expect(formatDecadeScaleLabel(1e9)).toBe("15 813 LY");
    expect(formatDecadeScaleLabel(1e10)).toBe("158 125 LY");
    for (const au of [1e6, 1e7, 1e8, 1e9, 1e10]) {
      expect(formatDecadeScaleLabel(au)).toMatch(/^[\d ]+ LY$/);
    }
  });

  it("DIDACTIC suppresses LY even at galactic AU values (cap honesty)", () => {
    // Didactic compression can never reach LY; allowLY=false keeps AU.
    for (const au of [1e5, 1e7, 1e10]) {
      const s = formatDecadeScaleLabel(au, false);
      expect(s).toContain("AU");
      expect(s).not.toContain("LY");
    }
  });

  it("renders one fractional digit below 10 LY, dropping a trailing .0", () => {
    expect(formatDecadeScaleLabel(2 * AU_PER_LY)).toBe("2 LY");
    expect(formatDecadeScaleLabel(2.5 * AU_PER_LY)).toBe("2.5 LY");
  });

  it("groups integer light-years above 10 LY (future wider decade range)", () => {
    expect(formatDecadeScaleLabel(100 * AU_PER_LY)).toBe("100 LY");
    expect(formatDecadeScaleLabel(100000 * AU_PER_LY)).toBe("100 000 LY");
  });
});

describe("formatDecadeScaleLabel — robustness", () => {
  it("falls back to '1 AU' for degenerate input (0, negative, NaN, Infinity)", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatDecadeScaleLabel(bad)).toBe("1 AU");
    }
  });
});
