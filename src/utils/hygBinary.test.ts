import { describe, it, expect } from "vitest";
import {
  parseHygBinaryBuffer,
  encodeHygCatalog,
  encodeHygStar,
  HYG_MAGIC,
  HYG_VERSION,
  HYG_VERSION_V1,
  HYG_HEADER_BYTES,
  HYG_HEADER_BYTES_V1,
  HYG_BYTES_PER_STAR,
  HYG_BYTES_PER_STAR_V1,
  HYG_FLAG_HAS_PROPER_MOTION,
  HYG_FLAG_HAS_SPECT_AND_ABSMAG,
  HYG_MAG_OFFSET,
  HYG_MAG_STEP,
  HYG_CI_OFFSET,
  HYG_CI_STEP,
  HYG_MAX_SPECT_STRINGS,
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

// T6.2-β-α additions: stars with spect + absmag for v2 round-trip.
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

describe("hygBinary / constants", () => {
  it("declares a stable format identity (v2 current, v1 legacy)", () => {
    expect(HYG_MAGIC).toBe("HYG1");
    expect(HYG_VERSION).toBe(2);
    expect(HYG_VERSION_V1).toBe(1);
    expect(HYG_HEADER_BYTES).toBe(20);
    expect(HYG_HEADER_BYTES_V1).toBe(16);
    expect(HYG_BYTES_PER_STAR).toBe(23);
    expect(HYG_BYTES_PER_STAR_V1).toBe(18);
  });

  it("packs a 117k-star v2 catalog into under 2.7 MB before gzip", () => {
    // v2 sanity: 117k stars × 23 + 20 header + ~1KB string table.
    // Slightly over v1's ~2.1MB budget but still well under 3MB.
    const bytes = HYG_HEADER_BYTES + 1024 + 117_000 * HYG_BYTES_PER_STAR;
    expect(bytes).toBeLessThan(2.8 * 1024 * 1024);
  });

  it("HYG_MAX_SPECT_STRINGS fits in a uint8 index space", () => {
    expect(HYG_MAX_SPECT_STRINGS).toBe(256);
  });

  it("HYG_FLAG_HAS_SPECT_AND_ABSMAG is bit 1", () => {
    expect(HYG_FLAG_HAS_SPECT_AND_ABSMAG).toBe(1 << 1);
  });
});

describe("hygBinary / v2 round-trip (current encoder)", () => {
  it("encodes then decodes an empty catalog with no loss", () => {
    const buffer = encodeHygCatalog([]);
    // v2 empty: 20 header + 1 byte string table (length=0 sentinel) + 0 body.
    expect(buffer.byteLength).toBe(HYG_HEADER_BYTES + 1);

    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.magic).toBe(HYG_MAGIC);
    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.count).toBe(0);
    expect(parsed.header.hasProperMotion).toBe(true);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false); // no spect data → flag clear
    expect(parsed.positions).toHaveLength(0);
    expect(parsed.magnitudes).toHaveLength(0);
    expect(parsed.colorIndices).toHaveLength(0);
    expect(parsed.pmRA).toHaveLength(0);
    expect(parsed.pmDec).toHaveLength(0);
    // v2 default fields: empty string table contains just the "" sentinel.
    expect(parsed.spectStrings).toEqual([""]);
    expect(parsed.spectIndices).toHaveLength(0);
    expect(parsed.absmag).toHaveLength(0);
  });

  it("preserves stars without spect/absmag (back-compat input shape)", () => {
    const buffer = encodeHygCatalog([SIRIUS, BARNARDS_STAR]);
    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.count).toBe(2);
    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
    // Every star points to the "" sentinel.
    expect(parsed.spectIndices[0]).toBe(0);
    expect(parsed.spectIndices[1]).toBe(0);
    // absmag defaults to NaN.
    expect(Number.isNaN(parsed.absmag[0])).toBe(true);
    expect(Number.isNaN(parsed.absmag[1])).toBe(true);
    // Other fields preserved as in v1.
    expect(parsed.positions[0]).toBeCloseTo(SIRIUS.x, 5);
    expect(parsed.pmRA[1]).toBe(BARNARDS_STAR.pmRA);
  });

  it("preserves spect + absmag through the full v2 round-trip", () => {
    const buffer = encodeHygCatalog([SUN_LIKE_V2, BETELGEUSE_V2]);
    const parsed = parseHygBinaryBuffer(buffer);

    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.hasSpectAndAbsmag).toBe(true);
    // String table contains: ["", "G2V", "M2Iab"] (insertion order).
    expect(parsed.spectStrings).toEqual(["", "G2V", "M2Iab"]);
    // First star points at "G2V", second at "M2Iab".
    expect(parsed.spectIndices[0]).toBe(1);
    expect(parsed.spectIndices[1]).toBe(2);
    // absmag round-trips with float32 precision.
    expect(parsed.absmag[0]).toBeCloseTo(4.83, 5);
    expect(parsed.absmag[1]).toBeCloseTo(-5.85, 5);
  });

  it("deduplicates repeated spect strings into a single string-table entry", () => {
    // Three stars all with "G2V" — string table should have ["", "G2V"]
    // and all three spectIndices should point at index 1.
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
    // hasSpectAndAbsmag flag still set because absmag is finite on every star.
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

  it("clamps spectIdx to uint8 range in encodeHygStar", () => {
    // Lower-level test against encodeHygStar directly. spectIdx=300 →
    // clamped to 255 by the encoder.
    const buffer = new ArrayBuffer(HYG_BYTES_PER_STAR);
    const view = new DataView(buffer);
    encodeHygStar(view, 0, 0, 0, 0, 0, 0, 0, 0, 300, 5.0);
    expect(view.getUint8(18)).toBe(255);
    encodeHygStar(view, 0, 0, 0, 0, 0, 0, 0, 0, -10, 5.0);
    expect(view.getUint8(18)).toBe(0);
  });

  it("preserves Sirius and Barnard's Star within quantisation bounds (v2)", () => {
    const buffer = encodeHygCatalog([SIRIUS, BARNARDS_STAR]);
    expect(buffer.byteLength).toBe(
      HYG_HEADER_BYTES + 1 + 2 * HYG_BYTES_PER_STAR
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
    // 256 unique strings would fill the index space (0-255), but index 0
    // is reserved for "" → only 255 distinct non-empty strings allowed.
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
    expect(() => encodeHygCatalog(stars)).toThrow(/string table overflow/);
  });
});

describe("hygBinary / v1 backward-compat parser", () => {
  // Build a known-good v1 buffer manually so the v1 parser branch
  // gets exercised without needing the v1 encoder (which has been
  // bumped to emit v2). T6.2-β-α: existing on-disk hyg-v1-*.bin
  // files MUST still load until T6.2-β-β regenerates them.
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
    // v2 fields default to empty/sentinel.
    expect(parsed.spectStrings).toEqual([""]);
    expect(parsed.spectIndices).toHaveLength(0);
    expect(parsed.absmag).toHaveLength(0);
  });

  it("parses a v1 buffer with stars; default-fills v2 fields", () => {
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
    expect(parsed.spectIndices[1]).toBe(0);
    expect(parsed.absmag).toHaveLength(2);
    expect(Number.isNaN(parsed.absmag[0])).toBe(true);
    expect(Number.isNaN(parsed.absmag[1])).toBe(true);
    // hasSpectAndAbsmag stays false (v1 doesn't carry that flag).
    expect(parsed.header.hasSpectAndAbsmag).toBe(false);
  });

  it("rejects a v1 buffer whose declared count mismatches its size", () => {
    const buffer = new ArrayBuffer(HYG_HEADER_BYTES_V1);
    const view = new DataView(buffer);
    view.setUint8(0, "H".charCodeAt(0));
    view.setUint8(1, "Y".charCodeAt(0));
    view.setUint8(2, "G".charCodeAt(0));
    view.setUint8(3, "1".charCodeAt(0));
    view.setUint32(4, HYG_VERSION_V1, true);
    view.setUint32(8, 10, true); // claim 10 stars
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
    view.setUint32(8, 0, true);
    view.setUint32(12, 0, true);
    view.setUint32(16, 0, true);

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

  it("rejects a v2 buffer whose size does not match the declared count + string-table size", () => {
    const mismatched = new ArrayBuffer(HYG_HEADER_BYTES);
    const view = new DataView(mismatched);
    view.setUint8(0, HYG_MAGIC.charCodeAt(0));
    view.setUint8(1, HYG_MAGIC.charCodeAt(1));
    view.setUint8(2, HYG_MAGIC.charCodeAt(2));
    view.setUint8(3, HYG_MAGIC.charCodeAt(3));
    view.setUint32(4, HYG_VERSION, true);
    view.setUint32(8, 10, true); // claim 10 stars
    view.setUint32(12, 0, true);
    view.setUint32(16, 0, true); // string table is 0 bytes (no body either)

    expect(() => parseHygBinaryBuffer(mismatched)).toThrow(
      /Invalid HYG binary size/
    );
  });

  it("rejects a v2 buffer with a corrupt string table (length overflows)", () => {
    // Header: claim 1-byte string table. Body claims 0 stars.
    // String table byte: declare length=10 (overflows 1-byte budget).
    const buffer = new ArrayBuffer(HYG_HEADER_BYTES + 1);
    const view = new DataView(buffer);
    view.setUint8(0, HYG_MAGIC.charCodeAt(0));
    view.setUint8(1, HYG_MAGIC.charCodeAt(1));
    view.setUint8(2, HYG_MAGIC.charCodeAt(2));
    view.setUint8(3, HYG_MAGIC.charCodeAt(3));
    view.setUint32(4, HYG_VERSION, true);
    view.setUint32(8, 0, true);
    view.setUint32(12, 0, true);
    view.setUint32(16, 1, true);
    view.setUint8(20, 10); // declare 10-byte string but only 0 bytes follow

    expect(() => parseHygBinaryBuffer(buffer)).toThrow(/string table corrupt/);
  });
});
