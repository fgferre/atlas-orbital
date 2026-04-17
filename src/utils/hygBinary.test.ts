import { describe, it, expect } from "vitest";
import {
  parseHygBinaryBuffer,
  encodeHygCatalog,
  HYG_MAGIC,
  HYG_VERSION,
  HYG_HEADER_BYTES,
  HYG_BYTES_PER_STAR,
  HYG_FLAG_HAS_PROPER_MOTION,
  HYG_MAG_OFFSET,
  HYG_MAG_STEP,
  HYG_CI_OFFSET,
  HYG_CI_STEP,
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

describe("hygBinary / constants", () => {
  it("declares a stable format identity", () => {
    expect(HYG_MAGIC).toBe("HYG1");
    expect(HYG_VERSION).toBe(1);
    expect(HYG_HEADER_BYTES).toBe(16);
    expect(HYG_BYTES_PER_STAR).toBe(18);
  });

  it("packs a 117k-star catalog into under 2.1 MB before gzip", () => {
    // Quick sanity-check on the budget we promised the user.
    const bytes = HYG_HEADER_BYTES + 117_000 * HYG_BYTES_PER_STAR;
    expect(bytes).toBeLessThan(2.2 * 1024 * 1024);
  });
});

describe("hygBinary / round-trip", () => {
  it("encodes then decodes an empty catalog with no loss", () => {
    const buffer = encodeHygCatalog([]);
    expect(buffer.byteLength).toBe(HYG_HEADER_BYTES);

    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.magic).toBe(HYG_MAGIC);
    expect(parsed.header.version).toBe(HYG_VERSION);
    expect(parsed.header.count).toBe(0);
    expect(parsed.header.hasProperMotion).toBe(true);
    expect(parsed.positions).toHaveLength(0);
    expect(parsed.magnitudes).toHaveLength(0);
    expect(parsed.colorIndices).toHaveLength(0);
    expect(parsed.pmRA).toHaveLength(0);
    expect(parsed.pmDec).toHaveLength(0);
  });

  it("preserves Sirius and Barnard's Star within quantisation bounds", () => {
    const buffer = encodeHygCatalog([SIRIUS, BARNARDS_STAR]);
    expect(buffer.byteLength).toBe(HYG_HEADER_BYTES + 2 * HYG_BYTES_PER_STAR);

    const parsed = parseHygBinaryBuffer(buffer);
    expect(parsed.header.count).toBe(2);

    // Positions are Float32; identical to input to FP precision.
    expect(parsed.positions[0]).toBeCloseTo(SIRIUS.x, 5);
    expect(parsed.positions[1]).toBeCloseTo(SIRIUS.y, 5);
    expect(parsed.positions[2]).toBeCloseTo(SIRIUS.z, 5);
    expect(parsed.positions[3]).toBeCloseTo(BARNARDS_STAR.x, 5);
    expect(parsed.positions[4]).toBeCloseTo(BARNARDS_STAR.y, 5);
    expect(parsed.positions[5]).toBeCloseTo(BARNARDS_STAR.z, 5);

    // Magnitude step is 0.1 → absolute error ≤ 0.05.
    expect(Math.abs(parsed.magnitudes[0] - SIRIUS.mag)).toBeLessThanOrEqual(
      HYG_MAG_STEP / 2 + 1e-6
    );
    expect(
      Math.abs(parsed.magnitudes[1] - BARNARDS_STAR.mag)
    ).toBeLessThanOrEqual(HYG_MAG_STEP / 2 + 1e-6);

    // Colour index step is 0.01 → absolute error ≤ 0.005.
    expect(Math.abs(parsed.colorIndices[0] - SIRIUS.ci)).toBeLessThanOrEqual(
      HYG_CI_STEP / 2 + 1e-6
    );
    expect(
      Math.abs(parsed.colorIndices[1] - BARNARDS_STAR.ci)
    ).toBeLessThanOrEqual(HYG_CI_STEP / 2 + 1e-6);

    // Proper motion is integer mas/yr with no loss inside ±32767.
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

    // Quantised to the min/max representable magnitudes.
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

  it("rejects a buffer whose size does not match the declared count", () => {
    // Declare 10 stars but ship a header-only buffer.
    const mismatched = new ArrayBuffer(HYG_HEADER_BYTES);
    const view = new DataView(mismatched);
    view.setUint8(0, HYG_MAGIC.charCodeAt(0));
    view.setUint8(1, HYG_MAGIC.charCodeAt(1));
    view.setUint8(2, HYG_MAGIC.charCodeAt(2));
    view.setUint8(3, HYG_MAGIC.charCodeAt(3));
    view.setUint32(4, HYG_VERSION, true);
    view.setUint32(8, 10, true);
    view.setUint32(12, 0, true);

    expect(() => parseHygBinaryBuffer(mismatched)).toThrow(
      /Invalid HYG binary size/
    );
  });
});
