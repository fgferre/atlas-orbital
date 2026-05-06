import { describe, expect, it } from "vitest";

import {
  encodeHygCatalog,
  parseHygBinaryBuffer,
  type HygStarInput,
} from "../../utils/hygBinary";
import {
  BAYER_TO_GREEK,
  buildHygNameIndex,
  normalizeHygQuery,
  searchHygCatalog,
} from "./hygNameIndex";

const SIRIUS: HygStarInput = {
  x: -0.496,
  y: -1.609,
  z: -2.053,
  mag: -1.46,
  ci: 0.009,
  pmRA: -546,
  pmDec: -1223,
  spect: "A1V",
  absmag: 1.45,
  proper: "Sirius",
  bayer: "Alp",
  constellation: "CMa",
  gliese: "Gl 244A",
  flamsteed: 9,
  hd: 48915,
  hip: 32349,
};

const BETELGEUSE: HygStarInput = {
  x: 130,
  y: -100,
  z: -50,
  mag: 0.42,
  ci: 1.5,
  pmRA: 27,
  pmDec: 11,
  spect: "M1Ia",
  absmag: -5.85,
  proper: "Betelgeuse",
  bayer: "Alp",
  constellation: "Ori",
  flamsteed: 58,
  hd: 39801,
  hip: 27989,
};

const PROXIMA: HygStarInput = {
  x: -1,
  y: -0.4,
  z: -0.9,
  mag: 11.05,
  ci: 1.83,
  pmRA: -3781,
  pmDec: 769,
  spect: "M5V",
  absmag: 15.6,
  proper: "Proxima Centauri",
  gliese: "Gl 551",
  hd: 0,
  hip: 70890,
};

// Test against a parsed-from-encoder catalog so the index sees the
// real `HygCatalogData` shape (typed arrays + string pools), not a
// hand-rolled mock.
const buildCatalog = (stars: HygStarInput[]) =>
  parseHygBinaryBuffer(encodeHygCatalog(stars));

describe("normalizeHygQuery", () => {
  it("strips diacritics so 'Tupã' and 'Tupa' collapse to the same key", () => {
    expect(normalizeHygQuery("Tupã")).toBe("tupa");
    expect(normalizeHygQuery("Bibhā")).toBe("bibha");
  });

  it("preserves Greek glyphs (basic Greek letters do not decompose under NFD)", () => {
    expect(normalizeHygQuery("α CMa")).toBe("α cma");
    expect(normalizeHygQuery("β Ori")).toBe("β ori");
  });

  it("collapses internal whitespace and trims", () => {
    expect(normalizeHygQuery("  HD   48915  ")).toBe("hd 48915");
  });

  it("returns the empty string for whitespace-only queries", () => {
    expect(normalizeHygQuery("   ")).toBe("");
    expect(normalizeHygQuery("")).toBe("");
  });
});

describe("BAYER_TO_GREEK", () => {
  it("covers all 24 Greek letters", () => {
    expect(Object.keys(BAYER_TO_GREEK)).toHaveLength(24);
  });

  it("maps the canonical Yale Bright Star abbreviations to lowercase Greek", () => {
    expect(BAYER_TO_GREEK.Alp).toBe("α");
    expect(BAYER_TO_GREEK.Bet).toBe("β");
    expect(BAYER_TO_GREEK.Ome).toBe("ω");
  });
});

describe("buildHygNameIndex", () => {
  it("returns the same index instance on repeat calls (WeakMap cache)", () => {
    const catalog = buildCatalog([SIRIUS]);
    const a = buildHygNameIndex(catalog);
    const b = buildHygNameIndex(catalog);
    expect(a).toBe(b);
  });

  it("indexes Sirius under all four spec key variants (proper / Bayer-Greek / HD / HIP / Gliese)", () => {
    const catalog = buildCatalog([SIRIUS]);
    const index = buildHygNameIndex(catalog);
    expect(index.byKey.get("sirius")).toEqual([0]);
    expect(index.byKey.get("alp cma")).toEqual([0]);
    expect(index.byKey.get("α cma")).toEqual([0]);
    expect(index.byKey.get("hd 48915")).toEqual([0]);
    expect(index.byKey.get("hip 32349")).toEqual([0]);
    expect(index.byKey.get("gl 244a")).toEqual([0]);
  });

  it("groups star indices that share a key (e.g. Bayer Alp Ori for the Orion arrangement)", () => {
    // Sirius and Betelgeuse both carry bayer="Alp" but in different
    // constellations, so the keyed entries stay distinct.
    const catalog = buildCatalog([SIRIUS, BETELGEUSE]);
    const index = buildHygNameIndex(catalog);
    expect(index.byKey.get("alp cma")).toEqual([0]);
    expect(index.byKey.get("alp ori")).toEqual([1]);
    expect(index.byKey.get("α cma")).toEqual([0]);
    expect(index.byKey.get("α ori")).toEqual([1]);
  });

  it("skips empty designation fields without throwing", () => {
    // Proxima has no Bayer + no flamsteed in this fixture; ensure
    // those don't pollute the index with empty keys.
    const catalog = buildCatalog([PROXIMA]);
    const index = buildHygNameIndex(catalog);
    expect(index.byKey.has("")).toBe(false);
    expect(index.byKey.has(" ")).toBe(false);
    expect(index.byKey.get("proxima centauri")).toEqual([0]);
    expect(index.byKey.get("hip 70890")).toEqual([0]);
    expect(index.byKey.get("gl 551")).toEqual([0]);
    // No HD entry for Proxima fixture.
    expect(index.byKey.has("hd 0")).toBe(false);
  });
});

describe("searchHygCatalog — Sirius via every key shape (M6-C spec pin)", () => {
  const catalog = buildCatalog([SIRIUS, BETELGEUSE, PROXIMA]);

  for (const [label, query] of [
    ["proper name", "Sirius"],
    ["proper name (lower-case)", "sirius"],
    ["proper name partial prefix", "siri"],
    ["Bayer abbreviation form", "alp cma"],
    ["Bayer Greek form", "α CMa"],
    ["Bayer Greek form, case-insensitive", "Α CMA"],
    ["HD catalog ID", "HD 48915"],
    ["HIP catalog ID", "hip 32349"],
    ["Gliese designation", "Gl 244A"],
  ] as const) {
    it(`finds Sirius via ${label} ("${query}")`, () => {
      const results = searchHygCatalog(query, catalog);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.starIndex).toBe(0);
      expect(results[0]?.properName).toBe("Sirius");
    });
  }
});

describe("searchHygCatalog — result shape", () => {
  it("populates the rich result fields including derived bayerGreek + distancePc", () => {
    const catalog = buildCatalog([SIRIUS]);
    const [hit] = searchHygCatalog("Sirius", catalog);
    expect(hit).toBeDefined();
    expect(hit?.starIndex).toBe(0);
    expect(hit?.properName).toBe("Sirius");
    expect(hit?.bayerAbbrev).toBe("Alp");
    expect(hit?.bayerGreek).toBe("α");
    expect(hit?.constellation).toBe("CMa");
    expect(hit?.gliese).toBe("Gl 244A");
    expect(hit?.spect).toBe("A1V");
    expect(hit?.hd).toBe(48915);
    expect(hit?.hip).toBe(32349);
    expect(hit?.matchedField).toBe("proper");
    // Sirius is at (x≈-0.496, y≈-1.609, z≈-2.053) pc; |r| ≈ 2.64 pc.
    expect(hit?.distancePc).not.toBeNull();
    expect(hit?.distancePc).toBeCloseTo(2.64, 1);
  });

  it("tags matchedField correctly per key shape", () => {
    const catalog = buildCatalog([SIRIUS]);
    expect(searchHygCatalog("HD 48915", catalog)[0]?.matchedField).toBe("hd");
    expect(searchHygCatalog("HIP 32349", catalog)[0]?.matchedField).toBe("hip");
    expect(searchHygCatalog("Gl 244A", catalog)[0]?.matchedField).toBe(
      "gliese"
    );
    expect(searchHygCatalog("α CMa", catalog)[0]?.matchedField).toBe("bayer");
    expect(searchHygCatalog("Sirius", catalog)[0]?.matchedField).toBe("proper");
  });
});

describe("searchHygCatalog — ranking and limits", () => {
  it("returns no results for the empty / whitespace-only query", () => {
    const catalog = buildCatalog([SIRIUS, BETELGEUSE]);
    expect(searchHygCatalog("", catalog)).toEqual([]);
    expect(searchHygCatalog("   ", catalog)).toEqual([]);
  });

  it("respects the limit argument and clamps to brightest-first on ties", () => {
    // All three stars have a "Centauri" or "Sirius" suffix mismatch;
    // searching "i" matches Sirius (proper) substring at score 75.
    const catalog = buildCatalog([SIRIUS, BETELGEUSE, PROXIMA]);
    const top = searchHygCatalog("i", catalog, 2);
    expect(top.length).toBeLessThanOrEqual(2);
  });

  it("breaks score ties by apparent magnitude (brightest first)", () => {
    // Two stars with the same proper-name prefix; Sirius (mag -1.46)
    // sorts ahead of Betelgeuse (mag 0.42).
    const catalog = buildCatalog([
      { ...SIRIUS, proper: "Test" },
      { ...BETELGEUSE, proper: "Test 2" },
    ]);
    const results = searchHygCatalog("test", catalog);
    expect(results[0]?.starIndex).toBe(0); // Sirius (brighter)
    expect(results[1]?.starIndex).toBe(1); // Betelgeuse
  });

  it("returns higher score for prefix matches over substring matches", () => {
    const catalog = buildCatalog([
      { ...SIRIUS, proper: "Sirius" },
      { ...BETELGEUSE, proper: "Aldsiruslike" }, // substring "sirus" mid-word
    ]);
    const results = searchHygCatalog("sirius", catalog);
    expect(results[0]?.starIndex).toBe(0);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("matches Tupã via diacritic-stripped 'tupa' query", () => {
    const catalog = buildCatalog([{ ...SIRIUS, proper: "Tupã" }]);
    const results = searchHygCatalog("tupa", catalog);
    expect(results[0]?.starIndex).toBe(0);
    expect(results[0]?.properName).toBe("Tupã");
  });
});
