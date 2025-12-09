/**
 * Unit tests for NASA Eyes Star Catalog Binary Parser
 */

import { describe, it, expect } from "vitest";
import {
  BinaryReader,
  rotateByQuaternion,
  parseNASAStarBuffer,
} from "./nasaStarParser";

/**
 * Helper: Create a mock binary buffer with star data.
 * Format matches NASA Eyes binary structure.
 */
function createMockBuffer(
  stars: Array<{
    mag: number;
    absMag: number;
    r: number;
    g: number;
    b: number;
    x: number;
    y: number;
    z: number;
  }>
): ArrayBuffer {
  // 4 bytes for count + 23 bytes per star
  const buffer = new ArrayBuffer(4 + stars.length * 23);
  const view = new DataView(buffer);
  let offset = 0;

  // Write star count
  view.setInt32(offset, stars.length, true);
  offset += 4;

  // Write each star
  for (const star of stars) {
    view.setFloat32(offset, star.mag, true);
    offset += 4;
    view.setFloat32(offset, star.absMag, true);
    offset += 4;
    view.setUint8(offset, star.r);
    offset += 1;
    view.setUint8(offset, star.g);
    offset += 1;
    view.setUint8(offset, star.b);
    offset += 1;
    // Note: Order in file is Y, Z, X
    view.setFloat32(offset, star.y, true);
    offset += 4;
    view.setFloat32(offset, star.z, true);
    offset += 4;
    view.setFloat32(offset, star.x, true);
    offset += 4;
  }

  return buffer;
}

// ============================================================================
// BinaryReader Tests
// ============================================================================

describe("BinaryReader", () => {
  it("should read Int32 little-endian", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, 12345, true); // little-endian

    const reader = new BinaryReader(buffer);
    expect(reader.readInt32()).toBe(12345);
  });

  it("should read negative Int32", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, -42, true);

    const reader = new BinaryReader(buffer);
    expect(reader.readInt32()).toBe(-42);
  });

  it("should read Float32 little-endian", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, Math.PI, true);

    const reader = new BinaryReader(buffer);
    expect(reader.readFloat32()).toBeCloseTo(Math.PI, 5);
  });

  it("should read negative Float32", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, -2.5, true);

    const reader = new BinaryReader(buffer);
    expect(reader.readFloat32()).toBeCloseTo(-2.5, 5);
  });

  it("should read Byte", () => {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, 255);

    const reader = new BinaryReader(buffer);
    expect(reader.readByte()).toBe(255);
  });

  it("should handle multiple sequential reads", () => {
    const buffer = new ArrayBuffer(9); // Int32 + Float32 + Byte
    const view = new DataView(buffer);
    view.setInt32(0, 100, true);
    view.setFloat32(4, 1.5, true);
    view.setUint8(8, 42);

    const reader = new BinaryReader(buffer);
    expect(reader.readInt32()).toBe(100);
    expect(reader.readFloat32()).toBeCloseTo(1.5, 5);
    expect(reader.readByte()).toBe(42);
  });

  it("should detect end of buffer", () => {
    const buffer = new ArrayBuffer(4);
    const reader = new BinaryReader(buffer);

    expect(reader.isAtEnd()).toBe(false);
    reader.readInt32();
    expect(reader.isAtEnd()).toBe(true);
  });

  it("should track offset correctly", () => {
    const buffer = new ArrayBuffer(10);
    const reader = new BinaryReader(buffer);

    expect(reader.getOffset()).toBe(0);
    reader.readInt32();
    expect(reader.getOffset()).toBe(4);
    reader.readFloat32();
    expect(reader.getOffset()).toBe(8);
    reader.readByte();
    expect(reader.getOffset()).toBe(9);
  });
});

// ============================================================================
// rotateByQuaternion Tests
// ============================================================================

describe("rotateByQuaternion", () => {
  it("should preserve X component for X-axis rotation", () => {
    const result = rotateByQuaternion(5.0, 0, 0);
    expect(result.x).toBeCloseTo(5.0, 5);
  });

  it("should rotate vector around X axis by ~23.44°", () => {
    // A vector pointing along Y should rotate into Y-Z plane
    const result = rotateByQuaternion(0, 1, 0);

    // After 23.44° rotation around X:
    // y' = cos(23.44°) ≈ 0.9174
    // z' = sin(23.44°) ≈ 0.3979
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0.9174, 3);
    expect(result.z).toBeCloseTo(0.3979, 3);
  });

  it("should preserve vector magnitude", () => {
    const x = 3,
      y = 4,
      z = 5;
    const originalMag = Math.sqrt(x * x + y * y + z * z);

    const result = rotateByQuaternion(x, y, z);
    const rotatedMag = Math.sqrt(
      result.x * result.x + result.y * result.y + result.z * result.z
    );

    expect(rotatedMag).toBeCloseTo(originalMag, 5);
  });

  it("should handle zero vector", () => {
    const result = rotateByQuaternion(0, 0, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it("should handle negative coordinates", () => {
    const result = rotateByQuaternion(-1, -2, -3);
    const originalMag = Math.sqrt(1 + 4 + 9);
    const rotatedMag = Math.sqrt(
      result.x * result.x + result.y * result.y + result.z * result.z
    );

    expect(rotatedMag).toBeCloseTo(originalMag, 5);
  });
});

// ============================================================================
// parseNASAStarBuffer Tests
// ============================================================================

describe("parseNASAStarBuffer", () => {
  it("should parse buffer with single star", () => {
    const buffer = createMockBuffer([
      { mag: 1.5, absMag: 4.2, r: 255, g: 200, b: 150, x: 10, y: 20, z: 30 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    expect(stars).toHaveLength(1);
    expect(stars[0].mag).toBeCloseTo(1.5, 5);
    expect(stars[0].absMag).toBeCloseTo(4.2, 5);
  });

  it("should parse buffer with multiple stars", () => {
    const buffer = createMockBuffer([
      { mag: 1.0, absMag: 2.0, r: 255, g: 255, b: 255, x: 1, y: 2, z: 3 },
      { mag: 3.0, absMag: 4.0, r: 128, g: 128, b: 128, x: 4, y: 5, z: 6 },
      { mag: 5.0, absMag: 6.0, r: 64, g: 64, b: 64, x: 7, y: 8, z: 9 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    expect(stars).toHaveLength(3);
    expect(stars[0].mag).toBeCloseTo(1.0, 5);
    expect(stars[1].mag).toBeCloseTo(3.0, 5);
    expect(stars[2].mag).toBeCloseTo(5.0, 5);
  });

  it("should normalize RGB colors by max component", () => {
    // RGB (128, 255, 64) should normalize to (0.5, 1.0, 0.25)
    const buffer = createMockBuffer([
      { mag: 0, absMag: 0, r: 128, g: 255, b: 64, x: 0, y: 0, z: 0 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    expect(stars[0].color.r).toBeCloseTo(0.502, 2); // 128/255
    expect(stars[0].color.g).toBeCloseTo(1.0, 2); // 255/255
    expect(stars[0].color.b).toBeCloseTo(0.251, 2); // 64/255
  });

  it("should handle all-black colors without division by zero", () => {
    const buffer = createMockBuffer([
      { mag: 0, absMag: 0, r: 0, g: 0, b: 0, x: 0, y: 0, z: 0 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    expect(stars[0].color.r).toBe(0);
    expect(stars[0].color.g).toBe(0);
    expect(stars[0].color.b).toBe(0);
  });

  it("should negate Y position", () => {
    // Create star with Y=100, after negation should be -100 (before rotation)
    const buffer = createMockBuffer([
      { mag: 0, absMag: 0, r: 255, g: 255, b: 255, x: 0, y: 100, z: 0 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    // After negation (Y=-100) and rotation around X:
    // y' = -100 * cos(23.44°) ≈ -91.74
    // z' = -100 * sin(23.44°) ≈ -39.79
    expect(stars[0].position.y).toBeCloseTo(-91.74, 1);
    expect(stars[0].position.z).toBeCloseTo(-39.79, 1);
  });

  it("should apply quaternion rotation to positions", () => {
    const buffer = createMockBuffer([
      { mag: 0, absMag: 0, r: 255, g: 255, b: 255, x: 10, y: 0, z: 0 },
    ]);

    const stars = parseNASAStarBuffer(buffer);

    // X should be preserved for X-axis rotation
    expect(stars[0].position.x).toBeCloseTo(10, 5);
  });

  it("should throw error for buffer too small", () => {
    const buffer = new ArrayBuffer(2); // Less than 4 bytes
    expect(() => parseNASAStarBuffer(buffer)).toThrow("Buffer too small");
  });

  it("should throw error for negative star count", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, -1, true);

    expect(() => parseNASAStarBuffer(buffer)).toThrow("Invalid star count");
  });

  it("should throw error for incomplete star data", () => {
    const buffer = new ArrayBuffer(10); // 4 + 6 bytes (not enough for one star)
    const view = new DataView(buffer);
    view.setInt32(0, 1, true); // Claims 1 star

    expect(() => parseNASAStarBuffer(buffer)).toThrow("Buffer too small");
  });

  it("should handle empty buffer (zero stars)", () => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, 0, true);

    const stars = parseNASAStarBuffer(buffer);
    expect(stars).toHaveLength(0);
  });
});
