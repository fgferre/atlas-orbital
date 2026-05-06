import { describe, it, expect } from "vitest";
import {
  parseHygBinaryBuffer,
  encodeHygCatalog,
  encodeHygStar,
  HYG_MAGIC,
  HYG_VERSION,
  HYG_VERSION_V1,
  HYG_VERSION_V2,
  HYG_HEADER_BYTES,
  HYG_HEADER_BYTES_V1,
  HYG_HEADER_BYTES_V2,
  HYG_BYTES_PER_STAR,
  HYG_BYTES_PER_STAR_V1,
  HYG_BYTES_PER_STAR_V2,
  HYG_FLAG_HAS_PROPER_MOTION,
  HYG_FLAG_HAS_SPECT_AND_ABSMAG,
  HYG_FLAG_HAS_DESIGNATIONS,
  HYG_MAG_OFFSET,
  HYG_MAG_STEP,
  HYG_CI_OFFSET,
  HYG_CI_STEP,
  HYG_MAX_SPECT_STRINGS,
  HYG_MAX_BAYER_STRINGS,
  HYG_MAX_CONSTELLATION_STRINGS,
  HYG_MAX_PROPER_NAMES,
  HYG_MAX_GLIESE_STRINGS,
} from "./hygBinary";

const BARNARDS_STAR = {
  x: -0.1,
  y: -1.7,
  z: 0.5,
  mag: 9.51,
  ci: 1.57,
  // Barnard's Star has among the highest proper motions in the sky:
  // pmRA ≈ -798 mas/yr, pmDec ≈ +10362 mas/yr (both fit in int16 range).
  pmRA: -798,
  pmDec: 10362,
};

const SIRIUS = {
  x: -0.496,
  y: -1.609,
  z: -2.053,
  mag: -1.46,
  ci: 0.009,
  pmRA: -546,
  pmDec: -1223,
};

// v2-shape inputs (spect + absmag, no v3 designations).
const SUN_LIKE_V2 = {
  ...SIRIUS,
  spect: "G2V",
  absmag: 4.83,
};
const BETELGEUSE_V2 = {
  ...BARNARDS_STAR,
  spect: "M2Iab",
  absmag: -5.85,
};

// v3-shape input — Sirius with the full designation set per HYG. The wave
// file pins this as the canonical round-trip target for M6-B (proper="Sirius",
// bayer="Alp", con="CMa", hd=48915, hip=32349, gliese="Gl 244").
const SIRIUS_V3 = {
  ...SIRIUS,
  spect: "A1V",
  absmag: 1.45,
  proper: "Sirius",
  bayer: "Alp",
  constellation: "CMa",
  gliese: "Gl 244",
  flamsteed: 9, // 9 Canis Majoris
  hd: 48915,
  hip: 32349,
};

describe("hygBinary / constants", () => {
  it("declares a stable format identity (v3 current, v2 + v1 legacy)", () => {
    expect(HYG_MAGIC).toBe("HYG1");
    expect(HYG_VERSION).toBe(3);
    expect(HYG_VERSION_V2).toBe(2);
    expect(HYG_VERSION_V1).toBe(1);
    expect(HYG_HEADER_BYTES).toBe(36);
    expect(HYG_HEADER_BYTES_V2).toBe(20);
    expect(HYG_HEADER_BYTES_V1).toBe(16);
    expect(HYG_BYTES_PER_STAR).toBe(38);
    expect(HYG_BYTES_PER_STAR_V2).toBe(23);
    expect(HYG_BYTES_PER_STAR_V1).toBe(18);
  });

  it("packs a 117k-star v3 catalog into under 5 MB before gzip", () => {
    // v3 sanity: 117k stars × 38 + 36 header + ~10KB string tables.
    // Larger than v2's ~2.7 MB budget but still well under 5 MB; gzip
    // typically halves it again thanks to the sparse zero-padded fields.
    const bytes = HYG_HEADER_BYTES + 10 * 1024 + 117_000 * HYG_BYTES_PER_STAR;
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });

  it("HYG_MAX_*_STRINGS index caps line up with the per-star index widths", () => {
    expect(HYG_MAX_SPECT_STRINGS).toBe(256); // uint8
    expect(HYG_MAX_BAYER_STRINGS).toBe(256); // uint8
    expect(HYG_MAX_CONSTELLATION_STRINGS).toBe(256); // uint8
    expect(HYG_MAX_PROPER_NAMES).toBe(65536); // uint16
    expect(HYG_MAX_GLIESE_STRINGS).toBe(65536); // uint16
  });

  it("flag bits stay distinct across format generations", () => {
    expect(HYG_FLAG_HAS_PROPER_MOTION).toBe(1 << 0);
    expect(HYG_FLAG_HAS_SPECT_AND_ABSMAG).toBe(1 << 1);
    expect(HYG_FLAG_HAS_DESIGNATIONS).toBe(1 << 2);
  });
});

describe("hygBinary / v3 round-trip (current encoder)", () => {
  it("encodes then decodes an empty catalog with no loss", () => {
    const buffer = encodeHygCatalog([]);
    // v3 empty: 36 header + 5 string tables × 1 byte sentinel + 0 body.
    expect(buffer.byteLength).toBe(HYG_HEADER_BYTES + 5);

    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.magic).toBe(HYG_MAGIC);
    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.count).toBe(0);
    expect(parsed.header.hasProperMotion).toBe(true);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    expect(parsed.header.hasDesignations).toBe(false);
    expect(parsed.positions).toHaveLength(0);
    expect(parsed.magnitudes).toHaveLength(0);
    expect(parsed.colorIndices).toHaveLength(0);
    expect(parsed.pmRA).toHaveLength(0);
    expect(parsed.pmDec).toHaveLength(0);
    // Every string pool contains just the "" sentinel.
    expect(parsed.spectStrings).toEqual([""]);
    expect(parsed.properNameStrings).toEqual([""]);
    expect(parsed.bayerStrings).toEqual([""]);
    expect(parsed.constellationStrings).toEqual([""]);
    expect(parsed.glieseStrings).toEqual([""]);
    expect(parsed.spectIndices).toHaveLength(0);
    expect(parsed.absmag).toHaveLength(0);
    expect(parsed.properNameIndices).toHaveLength(0);
    expect(parsed.bayerIndices).toHaveLength(0);
    expect(parsed.constellationIndices).toHaveLength(0);
    expect(parsed.glieseIndices).toHaveLength(0);
    expect(parsed.flamsteed).toHaveLength(0);
    expect(parsed.hd).toHaveLength(0);
    expect(parsed.hip).toHaveLength(0);
  });

  it("preserves stars without spect/absmag/designations (back-compat shape)", () => {
    const buffer = encodeHygCatalog([SIRIUS, BARNARDS_STAR]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.count).toBe(2);
    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    expect(parsed.header.hasDesignations).toBe(false);
    // Every star points to the "" sentinel for every string pool.
    expect(parsed.spectIndices[0]).toBe(0);
    expect(parsed.spectIndices[1]).toBe(0);
    expect(parsed.properNameIndices[0]).toBe(0);
    expect(parsed.bayerIndices[0]).toBe(0);
    expect(parsed.constellationIndices[0]).toBe(0);
    expect(parsed.glieseIndices[0]).toBe(0);
    // Numeric IDs default to 0.
    expect(parsed.flamsteed[0]).toBe(0);
    expect(parsed.hd[0]).toBe(0);
    expect(parsed.hip[0]).toBe(0);
    // Position fields preserved as in v1.
    expect(parsed.positions[0]).toBeCloseTo(SIRIUS.x, 5);
    expect(parsed.pmRA[1]).toBe(BARNARDS_STAR.pmRA);
  });

  it("preserves spect + absmag through the v3 round-trip", () => {
    const buffer = encodeHygCatalog([SUN_LIKE_V2, BETELGEUSE_V2]);
    const parsed = parseHygBinaryBuffer(buffer);

    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.hasSpectAndAbsmag).toBe(true);
    expect(parsed.header.hasDesignations).toBe(false);
    expect(parsed.spectStrings).toEqual(["", "G2V", "M2Iab"]);
    expect(parsed.spectIndices[0]).toBe(1);
    expect(parsed.spectIndices[1]).toBe(2);
    expect(parsed.absmag[0]).toBeCloseTo(4.83, 5);
    expect(parsed.absmag[1]).toBeCloseTo(-5.85, 5);
  });

  it("deduplicates repeated spect strings into a single string-table entry", () => {
    const buffer = encodeHygCatalog([
      { ...SIRIUS, spect: "G2V", absmag: 4.83 },
      { ...SIRIUS, spect: "G2V", absmag: 4.83 },
      { ...SIRIUS, spect: "G2V", absmag: 4.83 },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.spectStrings).toEqual(["", "G2V"]);
    expect(parsed.spectIndices[0]).toBe(1);
    expect(parsed.spectIndices[1]).toBe(1);
    expect(parsed.spectIndices[2]).toBe(1);
  });

  it("treats null / undefined / empty-string spect as the '' sentinel", () => {
    const buffer = encodeHygCatalog([
      { ...SIRIUS, spect: null, absmag: 4.83 },
      { ...SIRIUS, spect: undefined, absmag: 4.83 },
      { ...SIRIUS, spect: "", absmag: 4.83 },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.spectStrings).toEqual([""]);
    expect(parsed.spectIndices[0]).toBe(0);
    expect(parsed.spectIndices[1]).toBe(0);
    expect(parsed.spectIndices[2]).toBe(0);
    expect(parsed.header.hasSpectAndAbsmag).toBe(true);
  });

  it("propagates NaN absmag through the round-trip", () => {
    const buffer = encodeHygCatalog([
      { ...SIRIUS, spect: "G2V", absmag: NaN },
      { ...SIRIUS, spect: "G2V", absmag: null },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(Number.isNaN(parsed.absmag[0])).toBe(true);
    expect(Number.isNaN(parsed.absmag[1])).toBe(true);
  });

  it("clamps spectIdx to uint8 range in encodeHygStar (v2-prefix contract)", () => {
    // encodeHygStar still writes the v2 23-byte prefix; v3 fields are
    // appended by the encoder. Buffer is sized to the full v3 record so
    // the test setup matches what the encoder allocates per-star.
    const buffer = new ArrayBuffer(HYG_BYTES_PER_STAR);
    const view = new DataView(buffer);
    encodeHygStar(view, 0, 0, 0, 0, 0, 0, 0, 0, 300, 5.0);
    expect(view.getUint8(18)).toBe(255);
    encodeHygStar(view, 0, 0, 0, 0, 0, 0, 0, 0, -10, 5.0);
    expect(view.getUint8(18)).toBe(0);
  });

  it("preserves Sirius and Barnard's Star within quantisation bounds (v3)", () => {
    const buffer = encodeHygCatalog([SIRIUS, BARNARDS_STAR]);
    // 36 header + 5 sentinel-only string tables (1 byte each) + 2 records.
    expect(buffer.byteLength).toBe(
      HYG_HEADER_BYTES + 5 + 2 * HYG_BYTES_PER_STAR
    );

    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.count).toBe(2);

    expect(parsed.positions[0]).toBeCloseTo(SIRIUS.x, 5);
    expect(parsed.positions[1]).toBeCloseTo(SIRIUS.y, 5);
    expect(parsed.positions[2]).toBeCloseTo(SIRIUS.z, 5);
    expect(parsed.positions[3]).toBeCloseTo(BARNARDS_STAR.x, 5);
    expect(parsed.positions[4]).toBeCloseTo(BARNARDS_STAR.y, 5);
    expect(parsed.positions[5]).toBeCloseTo(BARNARDS_STAR.z, 5);

    expect(Math.abs(parsed.magnitudes[0] - SIRIUS.mag)).toBeLessThanOrEqual(
      HYG_MAG_STEP / 2 + 1e-6
    );
    expect(
      Math.abs(parsed.magnitudes[1] - BARNARDS_STAR.mag)
    ).toBeLessThanOrEqual(HYG_MAG_STEP / 2 + 1e-6);

    expect(Math.abs(parsed.colorIndices[0] - SIRIUS.ci)).toBeLessThanOrEqual(
      HYG_CI_STEP / 2 + 1e-6
    );
    expect(
      Math.abs(parsed.colorIndices[1] - BARNARDS_STAR.ci)
    ).toBeLessThanOrEqual(HYG_CI_STEP / 2 + 1e-6);

    expect(parsed.pmRA[0]).toBe(SIRIUS.pmRA);
    expect(parsed.pmDec[0]).toBe(SIRIUS.pmDec);
    expect(parsed.pmRA[1]).toBe(BARNARDS_STAR.pmRA);
    expect(parsed.pmDec[1]).toBe(BARNARDS_STAR.pmDec);
  });

  it("clamps magnitude outside the quantised range without throwing", () => {
    const absurdlyBright = { ...SIRIUS, mag: -50 };
    const absurdlyFaint = { ...SIRIUS, mag: 100 };

    const parsed = parseHygBinaryBuffer(
      encodeHygCatalog([absurdlyBright, absurdlyFaint])
    );

    expect(parsed.magnitudes[0]).toBe(HYG_MAG_OFFSET);
    expect(parsed.magnitudes[1]).toBeCloseTo(
      255 * HYG_MAG_STEP + HYG_MAG_OFFSET,
      6
    );
  });

  it("clamps B-V outside the quantised range without throwing", () => {
    const veryBlue = { ...SIRIUS, ci: -2 };
    const veryRed = { ...SIRIUS, ci: 5 };

    const parsed = parseHygBinaryBuffer(encodeHygCatalog([veryBlue, veryRed]));

    expect(parsed.colorIndices[0]).toBe(HYG_CI_OFFSET);
    expect(parsed.colorIndices[1]).toBeCloseTo(
      255 * HYG_CI_STEP + HYG_CI_OFFSET,
      6
    );
  });

  it("clamps proper motion outside int16 range to ±32767", () => {
    const impossible = { ...SIRIUS, pmRA: 50000, pmDec: -50000 };
    const parsed = parseHygBinaryBuffer(encodeHygCatalog([impossible]));

    expect(parsed.pmRA[0]).toBe(32767);
    expect(parsed.pmDec[0]).toBe(-32768);
  });

  it("sets has_proper_motion flag in the header", () => {
    const parsed = parseHygBinaryBuffer(encodeHygCatalog([SIRIUS]));
    expect(parsed.header.flags & HYG_FLAG_HAS_PROPER_MOTION).toBeTruthy();
    expect(parsed.header.hasProperMotion).toBe(true);
  });

  it("rejects encoder input with more than 255 unique spect strings", () => {
    const stars: {
      x: number;
      y: number;
      z: number;
      mag: number;
      ci: number;
      pmRA: number;
      pmDec: number;
      spect: string;
    }[] = [];
    for (let i = 0; i < HYG_MAX_SPECT_STRINGS; i++) {
      stars.push({ ...SIRIUS, spect: `class_${i}` });
    }
    expect(() => encodeHygCatalog(stars)).toThrow(/spect pool overflow/);
  });
});

describe("hygBinary / v3 designations", () => {
  it("round-trips the canonical Sirius designation set", () => {
    const buffer = encodeHygCatalog([SIRIUS_V3]);
    const parsed = parseHygBinaryBuffer(buffer);

    expect(parsed.header.hasSpectAndAbsmag).toBe(true);
    expect(parsed.header.hasDesignations).toBe(true);
    expect(parsed.header.flags & HYG_FLAG_HAS_DESIGNATIONS).toBeTruthy();

    expect(parsed.properNameStrings).toEqual(["", "Sirius"]);
    expect(parsed.bayerStrings).toEqual(["", "Alp"]);
    expect(parsed.constellationStrings).toEqual(["", "CMa"]);
    expect(parsed.glieseStrings).toEqual(["", "Gl 244"]);

    expect(parsed.properNameIndices[0]).toBe(1);
    expect(parsed.bayerIndices[0]).toBe(1);
    expect(parsed.constellationIndices[0]).toBe(1);
    expect(parsed.glieseIndices[0]).toBe(1);

    expect(parsed.flamsteed[0]).toBe(9);
    expect(parsed.hd[0]).toBe(48915);
    expect(parsed.hip[0]).toBe(32349);
  });

  it("deduplicates shared constellation entries across stars", () => {
    // Sirius and four other stars all in CMa share the constellation pool.
    const buffer = encodeHygCatalog([
      { ...SIRIUS, constellation: "CMa" },
      { ...SIRIUS, constellation: "CMa" },
      { ...SIRIUS, constellation: "Ori" },
      { ...SIRIUS, constellation: "CMa" },
      { ...SIRIUS, constellation: "Ori" },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.constellationStrings).toEqual(["", "CMa", "Ori"]);
    expect(Array.from(parsed.constellationIndices)).toEqual([1, 1, 2, 1, 2]);
    expect(parsed.header.hasDesignations).toBe(true);
  });

  it("treats null / undefined / empty designation fields as the '' sentinel", () => {
    const buffer = encodeHygCatalog([
      { ...SIRIUS, proper: null, bayer: undefined, constellation: "" },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.properNameStrings).toEqual([""]);
    expect(parsed.bayerStrings).toEqual([""]);
    expect(parsed.constellationStrings).toEqual([""]);
    expect(parsed.properNameIndices[0]).toBe(0);
    expect(parsed.bayerIndices[0]).toBe(0);
    expect(parsed.constellationIndices[0]).toBe(0);
    // No designations populated → flag stays unset.
    expect(parsed.header.hasDesignations).toBe(false);
  });

  it("sets has_designations when only a numeric ID is populated", () => {
    // No string designations, just an HD ID. Flag must still flip so
    // consumers know designation lookups are meaningful.
    const buffer = encodeHygCatalog([{ ...SIRIUS, hd: 48915 }]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.hasDesignations).toBe(true);
    expect(parsed.hd[0]).toBe(48915);
  });

  it("clamps out-of-range numeric IDs to the field's unsigned cap", () => {
    const buffer = encodeHygCatalog([
      { ...SIRIUS, flamsteed: 500, hd: -100, hip: 1e12 },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.flamsteed[0]).toBe(255); // uint8 cap
    expect(parsed.hd[0]).toBe(0); // negative → 0
    expect(parsed.hip[0]).toBe(4294967295); // uint32 cap
  });

  it("rejects encoder input with more than 255 unique bayer entries", () => {
    const stars: {
      x: number;
      y: number;
      z: number;
      mag: number;
      ci: number;
      pmRA: number;
      pmDec: number;
      bayer: string;
    }[] = [];
    for (let i = 0; i < HYG_MAX_BAYER_STRINGS; i++) {
      stars.push({ ...SIRIUS, bayer: `B${i}` });
    }
    expect(() => encodeHygCatalog(stars)).toThrow(/bayer pool overflow/);
  });

  it("accepts up to 255 unique constellation entries (full IAU set fits)", () => {
    // 88 IAU constellations + headroom. 255 unique entries should encode
    // without throwing — exactly 255 + the "" sentinel = HYG_MAX (256).
    const stars = Array.from({ length: 255 }, (_, i) => ({
      ...SIRIUS,
      constellation: `C${i}`,
    }));
    expect(() => encodeHygCatalog(stars)).not.toThrow();
  });
});

describe("hygBinary / v2 backward-compat parser", () => {
  // Build a known-good v2 buffer manually so the v2 parser branch
  // gets exercised without needing the v2 encoder (which has been
  // bumped to emit v3). Existing on-disk hyg-v1-*.bin files baked
  // before M6-B's re-bake MUST still load.
  const buildV2Buffer = (
    stars: { spect?: string; absmag?: number; star: typeof SIRIUS }[]
  ): ArrayBuffer => {
    const count = stars.length;
    const spectMap = new Map<string, number>();
    spectMap.set("", 0);
    for (const s of stars) {
      const sp = s.spect ?? "";
      if (sp.length > 0 && !spectMap.has(sp)) spectMap.set(sp, spectMap.size);
    }
    const orderedSpect: string[] = new Array(spectMap.size);
    for (const [s, i] of spectMap) orderedSpect[i] = s;
    let spectBytes = 0;
    for (const s of orderedSpect) spectBytes += 1 + s.length;

    const totalBytes =
      HYG_HEADER_BYTES_V2 + spectBytes + count * HYG_BYTES_PER_STAR_V2;
    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);
    view.setUint8(0, "H".charCodeAt(0));
    view.setUint8(1, "Y".charCodeAt(0));
    view.setUint8(2, "G".charCodeAt(0));
    view.setUint8(3, "1".charCodeAt(0));
    view.setUint32(4, HYG_VERSION_V2, true);
    view.setUint32(8, count, true);
    view.setUint32(
      12,
      HYG_FLAG_HAS_PROPER_MOTION |
        (orderedSpect.length > 1 ? HYG_FLAG_HAS_SPECT_AND_ABSMAG : 0),
      true
    );
    view.setUint32(16, spectBytes, true);

    let cursor = HYG_HEADER_BYTES_V2;
    for (const s of orderedSpect) {
      view.setUint8(cursor, s.length);
      cursor += 1;
      for (let i = 0; i < s.length; i++) {
        view.setUint8(cursor + i, s.charCodeAt(i) & 0xff);
      }
      cursor += s.length;
    }

    let offset = cursor;
    for (const entry of stars) {
      const s = entry.star;
      view.setFloat32(offset + 0, s.x, true);
      view.setFloat32(offset + 4, s.y, true);
      view.setFloat32(offset + 8, s.z, true);
      const magQ = Math.max(
        0,
        Math.min(255, Math.round((s.mag - HYG_MAG_OFFSET) / HYG_MAG_STEP))
      );
      const ciQ = Math.max(
        0,
        Math.min(255, Math.round((s.ci - HYG_CI_OFFSET) / HYG_CI_STEP))
      );
      view.setUint8(offset + 12, magQ);
      view.setUint8(offset + 13, ciQ);
      view.setInt16(offset + 14, s.pmRA, true);
      view.setInt16(offset + 16, s.pmDec, true);
      const spectIdx = spectMap.get(entry.spect ?? "") ?? 0;
      view.setUint8(offset + 18, spectIdx);
      view.setFloat32(
        offset + 19,
        Number.isFinite(entry.absmag ?? NaN) ? (entry.absmag as number) : NaN,
        true
      );
      offset += HYG_BYTES_PER_STAR_V2;
    }
    return buffer;
  };

  it("parses an empty v2 buffer", () => {
    const buffer = buildV2Buffer([]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.version).toBe(HYG_VERSION_V2);
    expect(parsed.header.count).toBe(0);
    expect(parsed.header.hasProperMotion).toBe(true);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    expect(parsed.header.hasDesignations).toBe(false);
    // v3 fields default to empty/sentinel.
    expect(parsed.properNameStrings).toEqual([""]);
    expect(parsed.properNameIndices).toHaveLength(0);
    expect(parsed.hd).toHaveLength(0);
  });

  it("parses a v2 buffer with stars; default-fills v3 fields", () => {
    const buffer = buildV2Buffer([
      { star: SIRIUS, spect: "A1V", absmag: 1.45 },
      { star: BARNARDS_STAR, spect: "M4V", absmag: 13.21 },
    ]);
    const parsed = parseHygBinaryBuffer(buffer);

    expect(parsed.header.version).toBe(HYG_VERSION_V2);
    expect(parsed.header.count).toBe(2);
    expect(parsed.header.hasSpectAndAbsmag).toBe(true);
    expect(parsed.header.hasDesignations).toBe(false);

    // v2 fields preserved.
    expect(parsed.spectStrings).toEqual(["", "A1V", "M4V"]);
    expect(parsed.spectIndices[0]).toBe(1);
    expect(parsed.spectIndices[1]).toBe(2);
    expect(parsed.absmag[0]).toBeCloseTo(1.45, 5);
    expect(parsed.absmag[1]).toBeCloseTo(13.21, 5);

    // v3 fields default-filled.
    expect(parsed.properNameIndices).toHaveLength(2);
    expect(parsed.properNameIndices[0]).toBe(0);
    expect(parsed.bayerIndices[0]).toBe(0);
    expect(parsed.constellationIndices[0]).toBe(0);
    expect(parsed.glieseIndices[0]).toBe(0);
    expect(parsed.flamsteed[0]).toBe(0);
    expect(parsed.hd[0]).toBe(0);
    expect(parsed.hip[0]).toBe(0);
  });

  it("rejects a v2 buffer whose declared count mismatches its size", () => {
    const buffer = new ArrayBuffer(HYG_HEADER_BYTES_V2);
    const view = new DataView(buffer);
    view.setUint8(0, "H".charCodeAt(0));
    view.setUint8(1, "Y".charCodeAt(0));
    view.setUint8(2, "G".charCodeAt(0));
    view.setUint8(3, "1".charCodeAt(0));
    view.setUint32(4, HYG_VERSION_V2, true);
    view.setUint32(8, 10, true); // claim 10 stars
    view.setUint32(12, 0, true);
    view.setUint32(16, 0, true);
    expect(() => parseHygBinaryBuffer(buffer)).toThrow(
      /Invalid HYG binary size/
    );
  });
});

describe("hygBinary / v1 backward-compat parser", () => {
  const buildV1Buffer = (stars: (typeof SIRIUS)[]): ArrayBuffer => {
    const count = stars.length;
    const bytes = HYG_HEADER_BYTES_V1 + count * HYG_BYTES_PER_STAR_V1;
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);
    view.setUint8(0, "H".charCodeAt(0));
    view.setUint8(1, "Y".charCodeAt(0));
    view.setUint8(2, "G".charCodeAt(0));
    view.setUint8(3, "1".charCodeAt(0));
    view.setUint32(4, HYG_VERSION_V1, true);
    view.setUint32(8, count, true);
    view.setUint32(12, HYG_FLAG_HAS_PROPER_MOTION, true);
    let offset = HYG_HEADER_BYTES_V1;
    for (const s of stars) {
      view.setFloat32(offset + 0, s.x, true);
      view.setFloat32(offset + 4, s.y, true);
      view.setFloat32(offset + 8, s.z, true);
      const magQ = Math.max(
        0,
        Math.min(255, Math.round((s.mag - HYG_MAG_OFFSET) / HYG_MAG_STEP))
      );
      const ciQ = Math.max(
        0,
        Math.min(255, Math.round((s.ci - HYG_CI_OFFSET) / HYG_CI_STEP))
      );
      view.setUint8(offset + 12, magQ);
      view.setUint8(offset + 13, ciQ);
      view.setInt16(offset + 14, s.pmRA, true);
      view.setInt16(offset + 16, s.pmDec, true);
      offset += HYG_BYTES_PER_STAR_V1;
    }
    return buffer;
  };

  it("parses an empty v1 buffer", () => {
    const buffer = buildV1Buffer([]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.version).toBe(HYG_VERSION_V1);
    expect(parsed.header.count).toBe(0);
    expect(parsed.header.hasProperMotion).toBe(true);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    expect(parsed.header.hasDesignations).toBe(false);
    expect(parsed.spectStrings).toEqual([""]);
    expect(parsed.properNameStrings).toEqual([""]);
    expect(parsed.spectIndices).toHaveLength(0);
    expect(parsed.properNameIndices).toHaveLength(0);
    expect(parsed.absmag).toHaveLength(0);
    expect(parsed.hd).toHaveLength(0);
  });

  it("parses a v1 buffer with stars; default-fills v2 + v3 fields", () => {
    const buffer = buildV1Buffer([SIRIUS, BARNARDS_STAR]);
    const parsed = parseHygBinaryBuffer(buffer);

    expect(parsed.header.version).toBe(HYG_VERSION_V1);
    expect(parsed.header.count).toBe(2);

    // v1 fields preserved.
    expect(parsed.positions[0]).toBeCloseTo(SIRIUS.x, 5);
    expect(parsed.pmRA[1]).toBe(BARNARDS_STAR.pmRA);

    // v2 fields default-filled.
    expect(parsed.spectIndices).toHaveLength(2);
    expect(parsed.spectIndices[0]).toBe(0);
    expect(parsed.absmag).toHaveLength(2);
    expect(Number.isNaN(parsed.absmag[0])).toBe(true);

    // v3 fields default-filled.
    expect(parsed.properNameIndices).toHaveLength(2);
    expect(parsed.properNameIndices[0]).toBe(0);
    expect(parsed.bayerIndices[0]).toBe(0);
    expect(parsed.constellationIndices[0]).toBe(0);
    expect(parsed.glieseIndices[0]).toBe(0);
    expect(parsed.hd[0]).toBe(0);
    expect(parsed.hip[0]).toBe(0);

    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    expect(parsed.header.hasDesignations).toBe(false);
  });

  it("rejects a v1 buffer whose declared count mismatches its size", () => {
    const buffer = new ArrayBuffer(HYG_HEADER_BYTES_V1);
    const view = new DataView(buffer);
    view.setUint8(0, "H".charCodeAt(0));
    view.setUint8(1, "Y".charCodeAt(0));
    view.setUint8(2, "G".charCodeAt(0));
    view.setUint8(3, "1".charCodeAt(0));
    view.setUint32(4, HYG_VERSION_V1, true);
    view.setUint32(8, 10, true);
    view.setUint32(12, 0, true);
    expect(() => parseHygBinaryBuffer(buffer)).toThrow(
      /Invalid HYG binary size/
    );
  });
});

describe("hygBinary / error paths", () => {
  it("rejects an empty buffer", () => {
    expect(() => parseHygBinaryBuffer(new ArrayBuffer(0))).toThrow(/too small/);
  });

  it("rejects a buffer with the wrong magic", () => {
    const bad = new ArrayBuffer(HYG_HEADER_BYTES);
    const view = new DataView(bad);
    view.setUint8(0, 0x54); // 'T'
    view.setUint8(1, 0x59); // 'Y'
    view.setUint8(2, 0x43); // 'C'
    view.setUint8(3, 0x32); // '2'
    view.setUint32(4, HYG_VERSION, true);
    expect(() => parseHygBinaryBuffer(bad)).toThrow(
      /Invalid HYG binary header/
    );
  });

  it("rejects a buffer with an unknown version", () => {
    const valid = encodeHygCatalog([]);
    const view = new DataView(valid);
    view.setUint32(4, 99, true);
    expect(() => parseHygBinaryBuffer(valid)).toThrow(
      /Unsupported HYG binary version/
    );
  });

  it("rejects a v3 buffer whose size does not match the declared count + table sizes", () => {
    const mismatched = new ArrayBuffer(HYG_HEADER_BYTES);
    const view = new DataView(mismatched);
    view.setUint8(0, HYG_MAGIC.charCodeAt(0));
    view.setUint8(1, HYG_MAGIC.charCodeAt(1));
    view.setUint8(2, HYG_MAGIC.charCodeAt(2));
    view.setUint8(3, HYG_MAGIC.charCodeAt(3));
    view.setUint32(4, HYG_VERSION, true);
    view.setUint32(8, 10, true); // claim 10 stars
    view.setUint32(12, 0, true);
    view.setUint32(16, 0, true); // all 5 tables 0 bytes (no body either)
    view.setUint32(20, 0, true);
    view.setUint32(24, 0, true);
    view.setUint32(28, 0, true);
    view.setUint32(32, 0, true);
    expect(() => parseHygBinaryBuffer(mismatched)).toThrow(
      /Invalid HYG binary size/
    );
  });

  it("rejects a v3 buffer with a corrupt spect string table (length overflows)", () => {
    // Header: claim 1-byte spect table, 1-byte each for the other 4
    // tables. Body claims 0 stars. Spect table byte declares length=10
    // (overflows 1-byte budget).
    const buffer = new ArrayBuffer(HYG_HEADER_BYTES + 5);
    const view = new DataView(buffer);
    view.setUint8(0, HYG_MAGIC.charCodeAt(0));
    view.setUint8(1, HYG_MAGIC.charCodeAt(1));
    view.setUint8(2, HYG_MAGIC.charCodeAt(2));
    view.setUint8(3, HYG_MAGIC.charCodeAt(3));
    view.setUint32(4, HYG_VERSION, true);
    view.setUint32(8, 0, true);
    view.setUint32(12, 0, true);
    view.setUint32(16, 1, true); // spect: 1 byte
    view.setUint32(20, 1, true); // proper: 1 byte
    view.setUint32(24, 1, true); // bayer: 1 byte
    view.setUint32(28, 1, true); // con: 1 byte
    view.setUint32(32, 1, true); // gliese: 1 byte
    view.setUint8(HYG_HEADER_BYTES, 10); // declare 10-byte string in spect
    expect(() => parseHygBinaryBuffer(buffer)).toThrow(/spect table corrupt/);
  });
});
