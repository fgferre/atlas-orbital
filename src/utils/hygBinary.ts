/**
 * HYG v4.2 Binary Catalog Parser
 *
 * The HYG catalog ships as a ~14 MB CSV.gz with 119,614 stars. The offline
 * build pipeline (`scripts/build-hyg-binary.js`) converts that source into a
 * compact binary that keeps the fields the renderer actually needs and
 * quantises the rest for GPU-friendly uploads.
 *
 * Binary format — version 1, magic "HYG1", little-endian:
 *
 * ┌───────────────────────────── Header (16 B) ─────────────────────────────┐
 * │  [0..4)    magic    ASCII "HYG1"                                        │
 * │  [4..8)    version  uint32 (= 1)                                        │
 * │  [8..12)   count    uint32 — number of stars in this file               │
 * │  [12..16)  flags    uint32 — bit 0: has_proper_motion (always 1 in v1)  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Followed by `count` records of 18 bytes each:
 *
 * ┌────────────────────────── Per-star record (18 B) ───────────────────────┐
 * │  [ 0..4)  x      float32  position in parsecs (HYG equatorial J2000)    │
 * │  [ 4..8)  y      float32                                                │
 * │  [ 8..12) z      float32                                                │
 * │  [12..13) magQ   uint8    apparent magnitude, quantised:                │
 * │                           mag = magQ * 0.1 - 5.0                        │
 * │                           → range -5.0 ..+20.5 in 0.1 steps             │
 * │  [13..14) ciQ    uint8    B-V colour index, quantised:                  │
 * │                           ci  = ciQ  * 0.01 - 0.5                       │
 * │                           → range -0.5 ..+2.05 in 0.01 steps            │
 * │                           (covers typical B-V; outliers clamp)          │
 * │  [14..16) pmra   int16    proper motion RA  in mas/yr                   │
 * │  [16..18) pmdec  int16    proper motion Dec in mas/yr                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Stars are stored in ascending-magnitude order so LOD tier files can share
 * the same per-star indexing: a star named in the Low-tier sidecar retains
 * the same index in Medium / High / Full tiers (which are strict supersets).
 *
 * The compact per-star layout keeps the full-catalog file below the size of
 * the legacy `tycho2-processed.bin` while adding real proper motion and a
 * GPU-ready colour channel. Positions are pre-computed in the HYG CSV so
 * no runtime spherical-to-cartesian conversion is needed.
 */

export const HYG_MAGIC = "HYG1";
export const HYG_VERSION = 1;
export const HYG_HEADER_BYTES = 16;
export const HYG_BYTES_PER_STAR = 18;

export const HYG_FLAG_HAS_PROPER_MOTION = 1 << 0;

/** Quantisation constants — shared with `scripts/build-hyg-binary.js`. */
export const HYG_MAG_OFFSET = -5;
export const HYG_MAG_STEP = 0.1;
export const HYG_CI_OFFSET = -0.5;
export const HYG_CI_STEP = 0.01;

export interface HygCatalogHeader {
  magic: string;
  version: number;
  count: number;
  flags: number;
  hasProperMotion: boolean;
}

export interface HygCatalogData {
  header: HygCatalogHeader;
  /**
   * Contiguous Float32 view over the star records' position fields.
   * Length = count × 3, order is [x0, y0, z0, x1, y1, z1, ...].
   * Re-using the parent ArrayBuffer keeps parse cost at O(1).
   */
  positions: Float32Array;
  /** apparent magnitude, dequantised back to real units. Length = count. */
  magnitudes: Float32Array;
  /** B-V colour index, dequantised. Length = count. */
  colorIndices: Float32Array;
  /** Proper motion RA in mas/yr. Length = count. */
  pmRA: Int16Array;
  /** Proper motion Dec in mas/yr. Length = count. */
  pmDec: Int16Array;
}

function readMagic(view: DataView): string {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
}

/**
 * Parse a HYG binary buffer. Throws on unknown magic / version / truncated
 * body. Allocates three decoded typed arrays (mag, ci, pm), leaves the raw
 * positions as a zero-copy Float32Array view over the source buffer when it
 * is correctly aligned.
 */
export function parseHygBinaryBuffer(buffer: ArrayBuffer): HygCatalogData {
  if (buffer.byteLength < HYG_HEADER_BYTES) {
    throw new Error(
      `HYG binary too small: expected at least ${HYG_HEADER_BYTES} header bytes, got ${buffer.byteLength}`
    );
  }

  const view = new DataView(buffer);

  const magic = readMagic(view);
  if (magic !== HYG_MAGIC) {
    throw new Error(`Invalid HYG binary header: "${magic}"`);
  }

  const version = view.getUint32(4, true);
  if (version !== HYG_VERSION) {
    throw new Error(`Unsupported HYG binary version: ${version}`);
  }

  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);

  const expectedBytes = HYG_HEADER_BYTES + count * HYG_BYTES_PER_STAR;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid HYG binary size: expected ${expectedBytes} bytes for ${count} stars, got ${buffer.byteLength}`
    );
  }

  // Positions are 3 × Float32 per star, but the record stride is 18 B rather
  // than 12 B, so we cannot alias the body directly as Float32Array. We copy
  // once into a packed positions array and dequantise the other fields in
  // the same pass.
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const pmRA = new Int16Array(count);
  const pmDec = new Int16Array(count);

  let offset = HYG_HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = view.getFloat32(offset + 0, true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
    magnitudes[i] = view.getUint8(offset + 12) * HYG_MAG_STEP + HYG_MAG_OFFSET;
    colorIndices[i] = view.getUint8(offset + 13) * HYG_CI_STEP + HYG_CI_OFFSET;
    pmRA[i] = view.getInt16(offset + 14, true);
    pmDec[i] = view.getInt16(offset + 16, true);
    offset += HYG_BYTES_PER_STAR;
  }

  return {
    header: {
      magic,
      version,
      count,
      flags,
      hasProperMotion: (flags & HYG_FLAG_HAS_PROPER_MOTION) !== 0,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
  };
}

/**
 * Encode a single star into the binary record shape. Shared with the build
 * script through re-export so the format has one definitive implementation.
 */
export function encodeHygStar(
  view: DataView,
  offset: number,
  x: number,
  y: number,
  z: number,
  mag: number,
  ci: number,
  pmRA: number,
  pmDec: number
): void {
  view.setFloat32(offset + 0, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);

  const magQ = Math.max(
    0,
    Math.min(255, Math.round((mag - HYG_MAG_OFFSET) / HYG_MAG_STEP))
  );
  const ciQ = Math.max(
    0,
    Math.min(255, Math.round((ci - HYG_CI_OFFSET) / HYG_CI_STEP))
  );
  view.setUint8(offset + 12, magQ);
  view.setUint8(offset + 13, ciQ);

  const pmRaI = Math.max(-32768, Math.min(32767, Math.round(pmRA)));
  const pmDecI = Math.max(-32768, Math.min(32767, Math.round(pmDec)));
  view.setInt16(offset + 14, pmRaI, true);
  view.setInt16(offset + 16, pmDecI, true);
}

/**
 * Write a complete HYG binary file into a freshly allocated ArrayBuffer.
 * Used by the build script and by tests.
 */
export function encodeHygCatalog(
  stars: {
    x: number;
    y: number;
    z: number;
    mag: number;
    ci: number;
    pmRA: number;
    pmDec: number;
  }[]
): ArrayBuffer {
  const count = stars.length;
  const buffer = new ArrayBuffer(HYG_HEADER_BYTES + count * HYG_BYTES_PER_STAR);
  const view = new DataView(buffer);

  // Header
  view.setUint8(0, HYG_MAGIC.charCodeAt(0));
  view.setUint8(1, HYG_MAGIC.charCodeAt(1));
  view.setUint8(2, HYG_MAGIC.charCodeAt(2));
  view.setUint8(3, HYG_MAGIC.charCodeAt(3));
  view.setUint32(4, HYG_VERSION, true);
  view.setUint32(8, count, true);
  view.setUint32(12, HYG_FLAG_HAS_PROPER_MOTION, true);

  // Body
  let offset = HYG_HEADER_BYTES;
  for (const star of stars) {
    encodeHygStar(
      view,
      offset,
      star.x,
      star.y,
      star.z,
      star.mag,
      star.ci,
      star.pmRA,
      star.pmDec
    );
    offset += HYG_BYTES_PER_STAR;
  }

  return buffer;
}
