import { describe, expect, it } from "vitest";
import {
  parseTycho2BinaryBuffer,
  TYCHO2_VALUES_PER_STAR,
} from "./tycho2Binary";

function createMockTycho2Buffer(
  stars: Array<{
    ra: number;
    dec: number;
    parallax: number;
    mag: number;
    colorIndex: number;
  }>
): ArrayBuffer {
  const buffer = new ArrayBuffer(
    12 + stars.length * TYCHO2_VALUES_PER_STAR * 4
  );
  const view = new DataView(buffer);

  view.setUint8(0, "T".charCodeAt(0));
  view.setUint8(1, "Y".charCodeAt(0));
  view.setUint8(2, "C".charCodeAt(0));
  view.setUint8(3, "2".charCodeAt(0));
  view.setUint32(4, 1, true);
  view.setUint32(8, stars.length, true);

  let offset = 12;
  for (const star of stars) {
    view.setFloat32(offset, star.ra, true);
    offset += 4;
    view.setFloat32(offset, star.dec, true);
    offset += 4;
    view.setFloat32(offset, star.parallax, true);
    offset += 4;
    view.setFloat32(offset, star.mag, true);
    offset += 4;
    view.setFloat32(offset, star.colorIndex, true);
    offset += 4;
  }

  return buffer;
}

describe("parseTycho2BinaryBuffer", () => {
  it("parses the header and interleaved float payload", () => {
    const buffer = createMockTycho2Buffer([
      {
        ra: 12.5,
        dec: -42.25,
        parallax: 15.75,
        mag: 3.5,
        colorIndex: 0.82,
      },
      {
        ra: 0.25,
        dec: 18.5,
        parallax: 0.9,
        mag: -1.2,
        colorIndex: -0.1,
      },
    ]);

    const parsed = parseTycho2BinaryBuffer(buffer);

    expect(parsed.count).toBe(2);
    expect(parsed.data).toHaveLength(2 * TYCHO2_VALUES_PER_STAR);
    expect(parsed.data[0]).toBeCloseTo(12.5, 5);
    expect(parsed.data[1]).toBeCloseTo(-42.25, 5);
    expect(parsed.data[2]).toBeCloseTo(15.75, 5);
    expect(parsed.data[3]).toBeCloseTo(3.5, 5);
    expect(parsed.data[4]).toBeCloseTo(0.82, 5);
    expect(parsed.data[5]).toBeCloseTo(0.25, 5);
  });

  it("rejects buffers with the wrong magic header", () => {
    const buffer = createMockTycho2Buffer([]);
    const view = new DataView(buffer);
    view.setUint8(0, "B".charCodeAt(0));

    expect(() => parseTycho2BinaryBuffer(buffer)).toThrow(
      "Invalid Tycho-2 binary header"
    );
  });

  it("rejects unsupported versions", () => {
    const buffer = createMockTycho2Buffer([]);
    const view = new DataView(buffer);
    view.setUint32(4, 99, true);

    expect(() => parseTycho2BinaryBuffer(buffer)).toThrow(
      "Unsupported Tycho-2 binary version"
    );
  });

  it("rejects truncated payloads", () => {
    const validBuffer = createMockTycho2Buffer([
      {
        ra: 1,
        dec: 2,
        parallax: 3,
        mag: 4,
        colorIndex: 5,
      },
    ]);
    const truncated = validBuffer.slice(0, validBuffer.byteLength - 4);

    expect(() => parseTycho2BinaryBuffer(truncated)).toThrow(
      "Invalid Tycho-2 binary size"
    );
  });
});
