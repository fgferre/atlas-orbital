/**
 * NASA Eyes Star Catalog Binary Parser
 *
 * Parses binary star files from NASA Eyes on the Solar System.
 * Format discovered via reverse engineering of the minified app.js.
 *
 * Binary Format (little-endian):
 * - Int32: count (number of stars)
 * - For each star:
 *   - Float32: mag (apparent magnitude)
 *   - Float32: absMag (absolute magnitude)
 *   - Byte: r (0-255)
 *   - Byte: g (0-255)
 *   - Byte: b (0-255)
 *   - Float32: y (negated on load)
 *   - Float32: z
 *   - Float32: x
 *
 * Transformations applied:
 * - Y coordinate is negated
 * - RGB normalized by dividing by max(r,g,b)
 * - Quaternion rotation applied to convert ecliptic → equatorial J2000
 *
 * @module nasaStarParser
 */

/**
 * Represents a parsed star from the NASA Eyes catalog.
 */
export interface NASAStar {
  /** Apparent magnitude (brightness as seen from Earth) */
  mag: number;
  /** Absolute magnitude (intrinsic brightness at 10 parsecs) */
  absMag: number;
  /** Normalized RGB color (0-1 range, normalized by max component) */
  color: { r: number; g: number; b: number };
  /** Cartesian position in parsecs (J2000 equatorial frame) */
  position: { x: number; y: number; z: number };
}

/**
 * Little-endian binary data reader.
 * Provides sequential reading of typed values from an ArrayBuffer.
 */
export class BinaryReader {
  private view: DataView;
  private offset: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  /** Read a 32-bit signed integer (little-endian) */
  readInt32(): number {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /** Read a 32-bit float (little-endian) */
  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /** Read an unsigned byte */
  readByte(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /** Check if we've reached the end of the buffer */
  isAtEnd(): boolean {
    return this.offset >= this.view.byteLength;
  }

  /** Get current read position */
  getOffset(): number {
    return this.offset;
  }
}

/**
 * Rotates a 3D vector by the NASA Eyes quaternion.
 *
 * The quaternion represents a ~23.44° rotation around the X-axis,
 * transforming from ecliptic to equatorial J2000 coordinates.
 *
 * Quaternion: (x=0, y=0.2031230, z=0, w=0.9791532)
 * This is equivalent to rotating by θ = 2 * acos(0.9791532) ≈ 23.44°
 *
 * For a pure X-axis rotation, the formula simplifies to:
 * - x' = x
 * - y' = y*cos(θ) - z*sin(θ)
 * - z' = y*sin(θ) + z*cos(θ)
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns Rotated coordinates
 */
export function rotateByQuaternion(
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number } {
  // Pre-computed from quaternion (0, 0.2031230, 0, 0.9791532)
  // θ = 2 * acos(0.9791532) ≈ 23.44° (Earth's obliquity)
  const cosTheta = 0.9174077; // cos(23.44°)
  const sinTheta = 0.3979486; // sin(23.44°)

  return {
    x: x,
    y: y * cosTheta - z * sinTheta,
    z: y * sinTheta + z * cosTheta,
  };
}

/**
 * Parse a NASA Eyes star catalog binary buffer.
 *
 * @param buffer - ArrayBuffer containing the binary star data
 * @returns Array of parsed NASAStar objects
 * @throws Error if buffer is too small or malformed
 */
export function parseNASAStarBuffer(buffer: ArrayBuffer): NASAStar[] {
  if (buffer.byteLength < 4) {
    throw new Error(
      "Buffer too small: must contain at least 4 bytes for count"
    );
  }

  const reader = new BinaryReader(buffer);
  const count = reader.readInt32();

  if (count < 0) {
    throw new Error(`Invalid star count: ${count}`);
  }

  // Each star requires: 2*Float32(8) + 3*Byte(3) + 3*Float32(12) = 23 bytes
  const bytesPerStar = 23;
  const expectedSize = 4 + count * bytesPerStar;

  if (buffer.byteLength < expectedSize) {
    throw new Error(
      `Buffer too small: expected ${expectedSize} bytes for ${count} stars, got ${buffer.byteLength}`
    );
  }

  const stars: NASAStar[] = [];

  for (let i = 0; i < count; i++) {
    // Read magnitude data
    const mag = reader.readFloat32();
    const absMag = reader.readFloat32();

    // Read RGB bytes (0-255)
    const r = reader.readByte();
    const g = reader.readByte();
    const b = reader.readByte();

    // Read position (note: order is Y, Z, X in file)
    const posY = reader.readFloat32();
    const posZ = reader.readFloat32();
    const posX = reader.readFloat32();

    // Normalize RGB by max component (NASA's approach for color balance)
    const maxComponent = Math.max(r, g, b, 1); // Avoid division by zero
    const normalizedR = r / maxComponent;
    const normalizedG = g / maxComponent;
    const normalizedB = b / maxComponent;

    // Apply Y negation and quaternion rotation
    const negatedY = -posY;
    const rotated = rotateByQuaternion(posX, negatedY, posZ);

    stars.push({
      mag,
      absMag,
      color: { r: normalizedR, g: normalizedG, b: normalizedB },
      position: rotated,
    });
  }

  return stars;
}

/**
 * Fetch and parse a NASA Eyes star catalog binary file.
 *
 * @param url - URL to the binary file (e.g., '/data/nasa-stars/stars.0.bin')
 * @returns Promise resolving to array of parsed NASAStar objects
 * @throws Error if fetch fails or data is malformed
 *
 * @example
 * ```typescript
 * const stars = await parseNASAStarFile('/data/nasa-stars/stars.0.bin');
 * console.log(`Loaded ${stars.length} stars`);
 * ```
 */
export async function parseNASAStarFile(url: string): Promise<NASAStar[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();
  return parseNASAStarBuffer(buffer);
}
