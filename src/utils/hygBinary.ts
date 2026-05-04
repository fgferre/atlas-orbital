/**
 * HYG v4.2 Binary Catalog Parser
 *
 * The HYG catalog ships as a ~14 MB CSV.gz with 119,614 stars. The offline
 * build pipeline (`scripts/build-hyg-binary.js`) converts that source into a
 * compact binary that keeps the fields the renderer actually needs and
 * quantises the rest for GPU-friendly uploads.
 *
 * **Binary format — version-tolerant parser** (T6.2-β-α, 2026-05-04):
 *
 *   v1 (current on-disk, magic "HYG1", version=1)
 *
 *   ┌───────────────────────────── Header (16 B) ───────────────────────────┐
 *   │  [0..4)    magic    ASCII "HYG1"                                      │
 *   │  [4..8)    version  uint32 (= 1)                                      │
 *   │  [8..12)   count    uint32 — number of stars in this file             │
 *   │  [12..16)  flags    uint32 — bit 0: has_proper_motion (always 1 in v1)│
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   Per-star record (18 B):
 *     [ 0..12) x, y, z   float32 ×3 (parsec, HYG equatorial J2000)
 *     [12..13) magQ      uint8     (mag = magQ * 0.1 - 5.0)
 *     [13..14) ciQ       uint8     (ci  = ciQ  * 0.01 - 0.5)
 *     [14..16) pmra      int16     (mas/yr)
 *     [16..18) pmdec     int16
 *
 *   v2 (T6.2 — primary going forward, magic "HYG1", version=2)
 *
 *   ┌───────────────────────────── Header (20 B) ───────────────────────────┐
 *   │  [0..4)    magic              ASCII "HYG1" (kept; only version bumps) │
 *   │  [4..8)    version            uint32 (= 2)                            │
 *   │  [8..12)   count              uint32 — number of stars                │
 *   │  [12..16)  flags              uint32 — bit 0: has_proper_motion,      │
 *   │                                        bit 1: has_spect_and_absmag    │
 *   │  [16..20)  stringTableBytes   uint32 — variable-length spect table    │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   String table (`stringTableBytes` bytes total, immediately after header):
 *     [uint8 length, length bytes ASCII] entries packed back-to-back.
 *     Index 0 is reserved for "no spectral classification" (length=0, no
 *     bytes follow); subsequent indices correspond to unique spectral
 *     classifications observed in the catalog (~50 entries cover ~all
 *     of HYG).
 *
 *   Per-star record (23 B):
 *     [ 0..18) ... same as v1 above ...
 *     [18..19) spectIdx    uint8     — index into string table; 0 = none
 *     [19..23) absmag      float32   — absolute magnitude; NaN = unknown
 *
 *   **Why magic stays "HYG1"**: the magic identifies the format family;
 *   the version field discriminates structural changes within it. Bumping
 *   magic to "HYG2" would force an unnecessary rename of every consumer's
 *   format-detection code that only cares about "is this a HYG binary?".
 *   Per-version branching happens in the parser via the version field
 *   alone (matches the same convention atlas's other binary formats use).
 *
 * **Backward compatibility** (T6.2-β-α scope): the parser accepts both v1
 * and v2 buffers. v1 buffers populate `spectIndices` / `absmag` /
 * `spectStrings` with empty / NaN-filled defaults so all consumers see a
 * uniform `HygCatalogData` shape regardless of source version. The
 * encoder always emits v2; v1 stays loadable until the next re-bake (T6.2-β-β)
 * regenerates the on-disk files in v2 format.
 *
 * Stars are stored in ascending-magnitude order so LOD tier files can share
 * the same per-star indexing: a star named in the Low-tier sidecar retains
 * the same index in Medium / High / Full tiers (which are strict supersets).
 *
 * The compact per-star layout keeps the full-catalog file comfortably
 * under 2.5 MB raw (v2; ~2 MB for v1) while carrying real proper motion,
 * a GPU-ready colour channel, and (in v2) physically-meaningful spectral
 * classification. Positions are pre-computed in the HYG CSV so no runtime
 * spherical-to-cartesian conversion is needed.
 */

export const HYG_MAGIC = "HYG1";
/**
 * Current binary format version emitted by the encoder. Parser accepts
 * both v1 (16-byte header, 18-byte records) and v2 (20-byte header +
 * variable-length string table, 23-byte records). Bumped from 1 → 2 by
 * T6.2-β-α; v1 kept loadable until T6.2-β-β regenerates the .bin files.
 */
export const HYG_VERSION = 2;
/**
 * Legacy version constant — pinned so the parser's v1 branch stays
 * grep-able. Same numeric value the encoder emitted before T6.2-β-α.
 */
export const HYG_VERSION_V1 = 1;

/**
 * Header byte size for the current (v2) format. Parser uses
 * `HYG_HEADER_BYTES_V1 = 16` for v1 buffers via the version-branch.
 */
export const HYG_HEADER_BYTES = 20;
export const HYG_HEADER_BYTES_V1 = 16;
/**
 * Per-star record byte size for the current (v2) format. Parser uses
 * `HYG_BYTES_PER_STAR_V1 = 18` for v1 buffers.
 */
export const HYG_BYTES_PER_STAR = 23;
export const HYG_BYTES_PER_STAR_V1 = 18;

export const HYG_FLAG_HAS_PROPER_MOTION = 1 << 0;
/**
 * v2 flag bit signalling that the file carries spect + absmag fields.
 * The build script sets this when it has the data; the parser checks
 * it before treating per-star bytes as containing spectIdx + absmag.
 */
export const HYG_FLAG_HAS_SPECT_AND_ABSMAG = 1 << 1;

/** Quantisation constants — shared with `scripts/build-hyg-binary.js`. */
export const HYG_MAG_OFFSET = -5;
export const HYG_MAG_STEP = 0.1;
export const HYG_CI_OFFSET = -0.5;
export const HYG_CI_STEP = 0.01;

/**
 * Maximum number of unique spectral classification strings supported.
 * `spectIdx` is uint8, so the cap is 256 (index 0 reserved for "none",
 * leaving 255 distinct strings). HYG observation: ~50 unique class
 * strings cover the entire catalog, so 256 is comfortable.
 */
export const HYG_MAX_SPECT_STRINGS = 256;

export interface HygCatalogHeader {
  magic: string;
  version: number;
  count: number;
  flags: number;
  hasProperMotion: boolean;
  /** v2-only flag; false for v1 buffers. */
  hasSpectAndAbsmag: boolean;
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
  /**
   * **v2 fields** (always populated; v1 buffers get default values).
   *
   * String table of unique spectral classifications. Index 0 is the
   * empty string "" (reserved for "no classification"); other entries
   * are the unique strings observed in the catalog (e.g. "G2V", "M2Iab",
   * "DA2"). For v1 buffers this is `[""]` (just the empty sentinel).
   */
  spectStrings: string[];
  /**
   * Per-star index into `spectStrings`. Length = count. For v1 buffers
   * this is a zero-filled `Uint8Array(count)` (every star points to the
   * empty-string sentinel).
   */
  spectIndices: Uint8Array;
  /**
   * Per-star absolute magnitude (M_V). Length = count. NaN signals
   * "unknown" — caller-side checks via `Number.isFinite`. For v1
   * buffers this is a NaN-filled `Float32Array(count)`.
   */
  absmag: Float32Array;
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
 * Parse a HYG binary buffer. Branches on the version field in the
 * header: v1 → legacy 16+18-byte layout (no spect/absmag); v2 →
 * 20+23-byte layout with string table + per-star spect index +
 * absmag float. Throws on unknown magic, unknown version, or
 * truncated body.
 */
export function parseHygBinaryBuffer(buffer: ArrayBuffer): HygCatalogData {
  if (buffer.byteLength < HYG_HEADER_BYTES_V1) {
    throw new Error(
      `HYG binary too small: expected at least ${HYG_HEADER_BYTES_V1} header bytes, got ${buffer.byteLength}`
    );
  }

  const view = new DataView(buffer);

  const magic = readMagic(view);
  if (magic !== HYG_MAGIC) {
    throw new Error(`Invalid HYG binary header: "${magic}"`);
  }

  const version = view.getUint32(4, true);
  if (version === HYG_VERSION_V1) {
    return parseV1Body(buffer, view, magic);
  }
  if (version === HYG_VERSION) {
    return parseV2Body(buffer, view, magic);
  }
  throw new Error(`Unsupported HYG binary version: ${version}`);
}

/**
 * v1 parser — pre-T6.2-β-α layout. spectStrings / spectIndices /
 * absmag get default values (empty sentinel / zero-filled / NaN-filled)
 * so all consumers see a uniform `HygCatalogData` shape.
 */
function parseV1Body(
  buffer: ArrayBuffer,
  view: DataView,
  magic: string
): HygCatalogData {
  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);

  const expectedBytes = HYG_HEADER_BYTES_V1 + count * HYG_BYTES_PER_STAR_V1;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid HYG binary size: expected ${expectedBytes} bytes for ${count} stars, got ${buffer.byteLength}`
    );
  }

  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const pmRA = new Int16Array(count);
  const pmDec = new Int16Array(count);

  let offset = HYG_HEADER_BYTES_V1;
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = view.getFloat32(offset + 0, true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
    magnitudes[i] = view.getUint8(offset + 12) * HYG_MAG_STEP + HYG_MAG_OFFSET;
    colorIndices[i] = view.getUint8(offset + 13) * HYG_CI_STEP + HYG_CI_OFFSET;
    pmRA[i] = view.getInt16(offset + 14, true);
    pmDec[i] = view.getInt16(offset + 16, true);
    offset += HYG_BYTES_PER_STAR_V1;
  }

  // v2 default fields for back-compat shape.
  const spectStrings: string[] = [""];
  const spectIndices = new Uint8Array(count); // all zeros → "" sentinel
  const absmag = new Float32Array(count);
  absmag.fill(NaN);

  return {
    header: {
      magic,
      version: HYG_VERSION_V1,
      count,
      flags,
      hasProperMotion: (flags & HYG_FLAG_HAS_PROPER_MOTION) !== 0,
      hasSpectAndAbsmag: false,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
    spectStrings,
    spectIndices,
    absmag,
  };
}

/**
 * v2 parser — T6.2-β-α layout. Reads the variable-length string table
 * after the header, then the per-star body with extra spectIdx +
 * absmag fields.
 */
function parseV2Body(
  buffer: ArrayBuffer,
  view: DataView,
  magic: string
): HygCatalogData {
  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const stringTableBytes = view.getUint32(16, true);

  const expectedBytes =
    HYG_HEADER_BYTES + stringTableBytes + count * HYG_BYTES_PER_STAR;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid HYG binary size: expected ${expectedBytes} bytes for ${count} stars + ${stringTableBytes}-byte string table, got ${buffer.byteLength}`
    );
  }

  // Decode the string table. Each entry: uint8 length, then `length`
  // bytes of ASCII. Empty entries (length=0, no bytes) are kept so the
  // index space stays compact and "0 = no classification" remains the
  // sentinel by convention.
  const spectStrings: string[] = [];
  let stringOffset = HYG_HEADER_BYTES;
  const stringTableEnd = stringOffset + stringTableBytes;
  while (stringOffset < stringTableEnd) {
    const len = view.getUint8(stringOffset);
    stringOffset += 1;
    if (len === 0) {
      spectStrings.push("");
      continue;
    }
    if (stringOffset + len > stringTableEnd) {
      throw new Error(
        `HYG string table corrupt: entry at offset ${stringOffset - 1} declares length ${len} but only ${stringTableEnd - stringOffset} bytes remain`
      );
    }
    let s = "";
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(view.getUint8(stringOffset + i));
    }
    spectStrings.push(s);
    stringOffset += len;
  }

  // Per-star body.
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const pmRA = new Int16Array(count);
  const pmDec = new Int16Array(count);
  const spectIndices = new Uint8Array(count);
  const absmag = new Float32Array(count);

  let offset = HYG_HEADER_BYTES + stringTableBytes;
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = view.getFloat32(offset + 0, true);
    positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
    positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
    magnitudes[i] = view.getUint8(offset + 12) * HYG_MAG_STEP + HYG_MAG_OFFSET;
    colorIndices[i] = view.getUint8(offset + 13) * HYG_CI_STEP + HYG_CI_OFFSET;
    pmRA[i] = view.getInt16(offset + 14, true);
    pmDec[i] = view.getInt16(offset + 16, true);
    spectIndices[i] = view.getUint8(offset + 18);
    absmag[i] = view.getFloat32(offset + 19, true);
    offset += HYG_BYTES_PER_STAR;
  }

  return {
    header: {
      magic,
      version: HYG_VERSION,
      count,
      flags,
      hasProperMotion: (flags & HYG_FLAG_HAS_PROPER_MOTION) !== 0,
      hasSpectAndAbsmag: (flags & HYG_FLAG_HAS_SPECT_AND_ABSMAG) !== 0,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
    spectStrings,
    spectIndices,
    absmag,
  };
}

/**
 * Encode a single star into the v2 binary record shape. Shared with
 * the build script through re-export so the format has one definitive
 * implementation. T6.2-β-α: extended with `spectIdx` + `absmag`
 * parameters (back-compat default 0 / NaN means "no spectral data").
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
  pmDec: number,
  spectIdx: number = 0,
  absmag: number = NaN
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

  // T6.2-β-α v2 fields. spectIdx clamped to uint8 range; out-of-range
  // input falls back to 0 (no classification) rather than wrapping.
  const spectIdxU8 = Math.max(0, Math.min(255, Math.round(spectIdx)));
  view.setUint8(offset + 18, spectIdxU8);
  view.setFloat32(offset + 19, absmag, true);
}

/**
 * v2 catalog encoder. Emits magic="HYG1", version=2, and (when stars
 * carry `spect` or `absmag` data) the `HYG_FLAG_HAS_SPECT_AND_ABSMAG`
 * bit. Builds a packed string table from unique `spect` values and
 * writes per-star spectIdx + absmag into the body.
 *
 * Stars without spect/absmag get spectIdx=0 ("" sentinel) + absmag=NaN.
 * Empty input → header-only buffer (no body, empty string table).
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
    spect?: string | null;
    absmag?: number | null;
  }[]
): ArrayBuffer {
  const count = stars.length;

  // Build the string table. Index 0 reserved for "" sentinel; other
  // entries are unique non-empty spect strings observed in input.
  const spectIndexMap = new Map<string, number>();
  spectIndexMap.set("", 0);
  for (const star of stars) {
    const s = star.spect;
    if (typeof s === "string" && s.length > 0 && !spectIndexMap.has(s)) {
      if (spectIndexMap.size >= HYG_MAX_SPECT_STRINGS) {
        throw new Error(
          `HYG string table overflow: more than ${HYG_MAX_SPECT_STRINGS - 1} unique spectral classifications`
        );
      }
      spectIndexMap.set(s, spectIndexMap.size);
    }
  }

  // Build the string table bytes. Each entry is uint8 length + ASCII
  // bytes. The "" sentinel at index 0 contributes a single zero byte.
  const orderedStrings: string[] = new Array(spectIndexMap.size);
  for (const [s, idx] of spectIndexMap) {
    orderedStrings[idx] = s;
  }
  let stringTableBytes = 0;
  for (const s of orderedStrings) {
    stringTableBytes += 1 + s.length;
  }

  // Detect whether the input actually carries spect/absmag data so the
  // flag bit reports honestly. Empty string table (just the sentinel)
  // + all-NaN absmag → flag stays cleared.
  let hasSpectAndAbsmag = orderedStrings.length > 1;
  if (!hasSpectAndAbsmag) {
    for (const star of stars) {
      if (Number.isFinite(star.absmag ?? NaN)) {
        hasSpectAndAbsmag = true;
        break;
      }
    }
  }

  const flags =
    HYG_FLAG_HAS_PROPER_MOTION |
    (hasSpectAndAbsmag ? HYG_FLAG_HAS_SPECT_AND_ABSMAG : 0);

  const totalBytes =
    HYG_HEADER_BYTES + stringTableBytes + count * HYG_BYTES_PER_STAR;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // Header.
  view.setUint8(0, HYG_MAGIC.charCodeAt(0));
  view.setUint8(1, HYG_MAGIC.charCodeAt(1));
  view.setUint8(2, HYG_MAGIC.charCodeAt(2));
  view.setUint8(3, HYG_MAGIC.charCodeAt(3));
  view.setUint32(4, HYG_VERSION, true);
  view.setUint32(8, count, true);
  view.setUint32(12, flags, true);
  view.setUint32(16, stringTableBytes, true);

  // String table.
  let stringOffset = HYG_HEADER_BYTES;
  for (const s of orderedStrings) {
    view.setUint8(stringOffset, s.length);
    stringOffset += 1;
    for (let i = 0; i < s.length; i++) {
      view.setUint8(stringOffset + i, s.charCodeAt(i) & 0xff);
    }
    stringOffset += s.length;
  }

  // Body.
  let offset = HYG_HEADER_BYTES + stringTableBytes;
  for (const star of stars) {
    const spectIdx =
      typeof star.spect === "string" && star.spect.length > 0
        ? (spectIndexMap.get(star.spect) ?? 0)
        : 0;
    const absmagValue =
      typeof star.absmag === "number" && Number.isFinite(star.absmag)
        ? star.absmag
        : NaN;
    encodeHygStar(
      view,
      offset,
      star.x,
      star.y,
      star.z,
      star.mag,
      star.ci,
      star.pmRA,
      star.pmDec,
      spectIdx,
      absmagValue
    );
    offset += HYG_BYTES_PER_STAR;
  }

  return buffer;
}
