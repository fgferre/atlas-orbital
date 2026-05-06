/**
 * HYG v4.2 Binary Catalog Parser
 *
 * The HYG catalog ships as a ~14 MB CSV.gz with 119,614 stars. The offline
 * build pipeline (`scripts/build-hyg-binary.js`) converts that source into a
 * compact binary that keeps the fields the renderer actually needs and
 * quantises the rest for GPU-friendly uploads.
 *
 * **Binary format — version-tolerant parser**:
 *
 *   v1 (T6.2-α and earlier on-disk; magic "HYG1", version=1)
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
 *   v2 (T6.2-β-α, on-disk through M6-A; magic "HYG1", version=2)
 *
 *   ┌───────────────────────────── Header (20 B) ───────────────────────────┐
 *   │  [0..4)    magic              ASCII "HYG1" (kept; only version bumps) │
 *   │  [4..8)    version            uint32 (= 2)                            │
 *   │  [8..12)   count              uint32 — number of stars                │
 *   │  [12..16)  flags              uint32 — bit 0: has_proper_motion,      │
 *   │                                        bit 1: has_spect_and_absmag    │
 *   │  [16..20)  spectStringTableBytes uint32 — variable-length spect table │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   String table (`spectStringTableBytes` bytes total, immediately after header):
 *     [uint8 length, length bytes ASCII] entries packed back-to-back.
 *     Index 0 is reserved for "no spectral classification" (length=0, no
 *     bytes follow); subsequent indices correspond to unique spectral
 *     classifications observed in the catalog (~50 entries cover ~all
 *     of HYG).
 *
 *   Per-star record (23 B):
 *     [ 0..18) ... same as v1 above ...
 *     [18..19) spectIdx    uint8     — index into spect string table; 0 = none
 *     [19..23) absmag      float32   — absolute magnitude; NaN = unknown
 *
 *   v3 (M6-B — current encoder output; magic "HYG1", version=3)
 *
 *   Adds proper-name + Bayer + Flamsteed + HD + HIP + Gliese + constellation
 *   designations so the runtime can search the catalog by human-readable
 *   identifiers without a separate sidecar load. Strings are still ASCII;
 *   Greek-letter Bayer designations are stored as their HYG abbreviation
 *   ("Alp" / "Bet" / "Gam" / ...) and translated to Greek glyphs at display
 *   time per the wave-file recommendation (option (b) — minimum-diff).
 *
 *   ┌───────────────────────────── Header (36 B) ───────────────────────────┐
 *   │  [0..4)    magic                       ASCII "HYG1"                   │
 *   │  [4..8)    version                     uint32 (= 3)                   │
 *   │  [8..12)   count                       uint32                         │
 *   │  [12..16)  flags                       uint32 — adds bit 2:           │
 *   │                                                  has_designations     │
 *   │  [16..20)  spectStringTableBytes       uint32                         │
 *   │  [20..24)  properNameTableBytes        uint32                         │
 *   │  [24..28)  bayerTableBytes             uint32                         │
 *   │  [28..32)  constellationTableBytes     uint32                         │
 *   │  [32..36)  glieseTableBytes            uint32                         │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 *   Five string tables in order (each formatted like v2's spect table —
 *   uint8 length followed by ASCII bytes; index 0 is the "" sentinel):
 *     1. spect          (carried over from v2; semantics unchanged)
 *     2. properName     ("Sirius", "Vega", ... — empty index 0 = no name)
 *     3. bayer          ("Alp", "Bet", "Gam", ... 24 unique values in HYG)
 *     4. constellation  ("CMa", "Ori", ... 88 IAU 3-letter abbrevs)
 *     5. gliese         ("Gl 244", "Gl 411", ... — mostly unique per-star)
 *
 *   Per-star record (38 B):
 *     [ 0..23) ... same as v2 above ...
 *     [23..25) properNameIdx     uint16   (0 = "" sentinel)
 *     [25..26) bayerIdx          uint8    (0 = "" sentinel)
 *     [26..27) constellationIdx  uint8    (0 = "" sentinel)
 *     [27..29) glieseIdx         uint16   (0 = "" sentinel)
 *     [29..30) flamsteed         uint8    (0 = missing)
 *     [30..34) hd                uint32   (0 = missing)
 *     [34..38) hip               uint32   (0 = missing)
 *
 *   **Why uint16 for properName + gliese**: ~365 unique proper names + ~3.8k
 *   unique Gliese IDs in HYG. Both exceed uint8's 256-entry cap so uint16
 *   indexing is required. Bayer (24 unique) + constellation (88 unique) fit
 *   in uint8 with comfortable headroom.
 *
 *   **Why magic stays "HYG1"**: the magic identifies the format family;
 *   the version field discriminates structural changes within it. Bumping
 *   magic to "HYG2" would force an unnecessary rename of every consumer's
 *   format-detection code that only cares about "is this a HYG binary?".
 *   Per-version branching happens in the parser via the version field
 *   alone (matches the same convention atlas's other binary formats use).
 *
 * **Backward compatibility**: the parser accepts v1, v2, and v3 buffers.
 * v1 + v2 buffers populate the v3 fields with empty / zero-filled defaults
 * so all consumers see a uniform `HygCatalogData` shape regardless of
 * source version. The encoder always emits v3; older formats stay loadable
 * until the next re-bake regenerates the on-disk files.
 *
 * Stars are stored in ascending-magnitude order so LOD tier files can share
 * the same per-star indexing: a star named in the Low-tier sidecar retains
 * the same index in Medium / High / Full tiers (which are strict supersets).
 */

export const HYG_MAGIC = "HYG1";
/**
 * Current binary format version emitted by the encoder. Parser accepts
 * v1, v2, and v3. Bumped from 2 → 3 by M6-B (T6.4 forward-port wave); v1
 * and v2 stay loadable for already-baked local binaries until the next
 * re-bake regenerates the .bin files.
 */
export const HYG_VERSION = 3;
/**
 * Legacy version constants — pinned so the parser's per-version branches
 * stay grep-able. Same numeric values the encoder emitted before each
 * format bump.
 */
export const HYG_VERSION_V1 = 1;
export const HYG_VERSION_V2 = 2;

/**
 * Header byte size for the current (v3) format. The parser uses
 * `HYG_HEADER_BYTES_V2` (= 20) for v2 buffers and `HYG_HEADER_BYTES_V1`
 * (= 16) for v1 buffers via the version-branch.
 */
export const HYG_HEADER_BYTES = 36;
export const HYG_HEADER_BYTES_V2 = 20;
export const HYG_HEADER_BYTES_V1 = 16;

/**
 * Per-star record byte size for the current (v3) format. Older formats
 * use `HYG_BYTES_PER_STAR_V2` (= 23) and `HYG_BYTES_PER_STAR_V1` (= 18).
 */
export const HYG_BYTES_PER_STAR = 38;
export const HYG_BYTES_PER_STAR_V2 = 23;
export const HYG_BYTES_PER_STAR_V1 = 18;

export const HYG_FLAG_HAS_PROPER_MOTION = 1 << 0;
/**
 * v2 flag bit — file carries spect + absmag fields. v3 keeps the bit.
 */
export const HYG_FLAG_HAS_SPECT_AND_ABSMAG = 1 << 1;
/**
 * v3 flag bit — file carries proper-name, Bayer, Flamsteed, HD, HIP,
 * Gliese, and constellation designations. The build script sets this
 * when any star carries any designation; the parser checks it before
 * treating the v3 record extension as meaningful (zero values may be
 * legitimate sentinels even when the flag is unset).
 */
export const HYG_FLAG_HAS_DESIGNATIONS = 1 << 2;

/** Quantisation constants — shared with `scripts/build-hyg-binary.js`. */
export const HYG_MAG_OFFSET = -5;
export const HYG_MAG_STEP = 0.1;
export const HYG_CI_OFFSET = -0.5;
export const HYG_CI_STEP = 0.01;

/**
 * Maximum unique entries per string pool. Determined by the index width
 * each pool uses in the per-star record: spect / bayer / constellation
 * are uint8 (256 max, including index 0 = sentinel); properName / gliese
 * are uint16 (65 536 max). HYG observation: ~50 spect, ~24 bayer, 88
 * constellation, ~365 proper names, ~3.8k Gliese — all comfortable.
 */
export const HYG_MAX_SPECT_STRINGS = 256;
export const HYG_MAX_BAYER_STRINGS = 256;
export const HYG_MAX_CONSTELLATION_STRINGS = 256;
export const HYG_MAX_PROPER_NAMES = 65536;
export const HYG_MAX_GLIESE_STRINGS = 65536;

export interface HygCatalogHeader {
  magic: string;
  version: number;
  count: number;
  flags: number;
  hasProperMotion: boolean;
  /** v2+ flag; false for v1 buffers. */
  hasSpectAndAbsmag: boolean;
  /** v3+ flag; false for v1 / v2 buffers. */
  hasDesignations: boolean;
}

export interface HygCatalogData {
  header: HygCatalogHeader;
  /**
   * Contiguous Float32 view over the star records' position fields.
   * Length = count × 3, order is [x0, y0, z0, x1, y1, z1, ...].
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
   * **v2+ fields** (always populated; v1 buffers get default values).
   *
   * String table of unique spectral classifications. Index 0 is the
   * empty string "" (reserved for "no classification"); other entries
   * are the unique strings observed in the catalog. For v1 buffers
   * this is `[""]` (just the empty sentinel).
   */
  spectStrings: string[];
  /**
   * Per-star index into `spectStrings`. Length = count. For v1 buffers
   * this is a zero-filled `Uint8Array(count)`.
   */
  spectIndices: Uint8Array;
  /**
   * Per-star absolute magnitude (M_V). Length = count. NaN signals
   * "unknown". For v1 buffers this is a NaN-filled `Float32Array(count)`.
   */
  absmag: Float32Array;
  /**
   * **v3+ fields** (always populated; v1 / v2 buffers get defaults).
   *
   * Each pool is an ASCII string array with index 0 reserved for "" so
   * a per-star value of 0 always means "no value".
   */
  properNameStrings: string[];
  /** Per-star uint16 index into `properNameStrings`. Length = count. */
  properNameIndices: Uint16Array;
  bayerStrings: string[];
  /** Per-star uint8 index into `bayerStrings`. Length = count. */
  bayerIndices: Uint8Array;
  constellationStrings: string[];
  /** Per-star uint8 index into `constellationStrings`. Length = count. */
  constellationIndices: Uint8Array;
  glieseStrings: string[];
  /** Per-star uint16 index into `glieseStrings`. Length = count. */
  glieseIndices: Uint16Array;
  /**
   * Constellation-relative Flamsteed number. Length = count. 0 = missing.
   * HYG values fit in uint8 (≤89).
   */
  flamsteed: Uint8Array;
  /** Henry Draper catalog ID. Length = count. 0 = missing. */
  hd: Uint32Array;
  /** Hipparcos catalog ID. Length = count. 0 = missing. */
  hip: Uint32Array;
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
 * Decode a single ASCII string from the buffer at `offset`. Returns the
 * string and the byte count consumed (uint8 length prefix + length bytes).
 * Throws if the declared length runs past `endOffset`.
 */
function readPooledString(
  view: DataView,
  offset: number,
  endOffset: number,
  poolName: string
): { value: string; bytesConsumed: number } {
  const len = view.getUint8(offset);
  const bodyStart = offset + 1;
  if (bodyStart + len > endOffset) {
    throw new Error(
      `HYG ${poolName} table corrupt: entry at offset ${offset} declares length ${len} but only ${endOffset - bodyStart} bytes remain`
    );
  }
  let s = "";
  for (let i = 0; i < len; i++) {
    s += String.fromCharCode(view.getUint8(bodyStart + i));
  }
  return { value: s, bytesConsumed: 1 + len };
}

/**
 * Read a contiguous string-pool region as an array of ASCII strings.
 * Stops when `tableBytes` is consumed. Index 0 of the returned array
 * is the "" sentinel by convention (and emitted by every encoder).
 */
function readStringPool(
  view: DataView,
  offset: number,
  tableBytes: number,
  poolName: string
): string[] {
  const out: string[] = [];
  const end = offset + tableBytes;
  let cursor = offset;
  while (cursor < end) {
    const { value, bytesConsumed } = readPooledString(
      view,
      cursor,
      end,
      poolName
    );
    out.push(value);
    cursor += bytesConsumed;
  }
  if (cursor !== end) {
    throw new Error(
      `HYG ${poolName} table corrupt: trailing ${end - cursor} bytes after last entry`
    );
  }
  return out;
}

/**
 * Compute the byte length of a serialised string pool (sum of
 * `1 + s.length` per entry). Empty pools that should ship the ""
 * sentinel must include `[""]` so the pool occupies exactly 1 byte.
 */
function stringPoolBytes(pool: readonly string[]): number {
  let total = 0;
  for (const s of pool) total += 1 + s.length;
  return total;
}

/**
 * Write a string pool starting at `offset`. Returns the new write
 * offset. Each entry is uint8 length prefix + ASCII bytes (low byte of
 * each char). Non-ASCII chars get masked to the low byte; callers are
 * expected to pre-validate with `HYG_MAX_*` constants and ASCII-only
 * inputs (the wave-file recommendation for v3).
 */
function writeStringPool(
  view: DataView,
  offset: number,
  pool: readonly string[]
): number {
  let cursor = offset;
  for (const s of pool) {
    view.setUint8(cursor, s.length);
    cursor += 1;
    for (let i = 0; i < s.length; i++) {
      view.setUint8(cursor + i, s.charCodeAt(i) & 0xff);
    }
    cursor += s.length;
  }
  return cursor;
}

/**
 * Parse a HYG binary buffer. Branches on the version field in the
 * header: v1 → 16+18 layout; v2 → 20+23 layout with spect/absmag;
 * v3 → 36+38 layout with full designations. Throws on unknown magic,
 * unknown version, or truncated body.
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
  if (version === HYG_VERSION_V2) {
    return parseV2Body(buffer, view, magic);
  }
  if (version === HYG_VERSION) {
    return parseV3Body(buffer, view, magic);
  }
  throw new Error(`Unsupported HYG binary version: ${version}`);
}

/**
 * Build the default-filled v3 fields used when loading older buffers.
 * Centralised so v1 and v2 parsers stay consistent and any future
 * additions only need a single update site.
 */
function emptyV3Fields(count: number): {
  properNameStrings: string[];
  properNameIndices: Uint16Array;
  bayerStrings: string[];
  bayerIndices: Uint8Array;
  constellationStrings: string[];
  constellationIndices: Uint8Array;
  glieseStrings: string[];
  glieseIndices: Uint16Array;
  flamsteed: Uint8Array;
  hd: Uint32Array;
  hip: Uint32Array;
} {
  return {
    properNameStrings: [""],
    properNameIndices: new Uint16Array(count),
    bayerStrings: [""],
    bayerIndices: new Uint8Array(count),
    constellationStrings: [""],
    constellationIndices: new Uint8Array(count),
    glieseStrings: [""],
    glieseIndices: new Uint16Array(count),
    flamsteed: new Uint8Array(count),
    hd: new Uint32Array(count),
    hip: new Uint32Array(count),
  };
}

/**
 * v1 parser — pre-T6.2-β-α layout. spect/absmag and v3 designations
 * get default values (empty sentinel / zero-filled / NaN-filled) so
 * all consumers see a uniform `HygCatalogData` shape.
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
  const spectIndices = new Uint8Array(count);
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
      hasDesignations: false,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
    spectStrings,
    spectIndices,
    absmag,
    ...emptyV3Fields(count),
  };
}

/**
 * v2 parser — T6.2-β-α layout. Reads the spect string table after the
 * header and the per-star body with spectIdx + absmag. Default-fills
 * the v3 designation fields for consumers expecting the unified shape.
 */
function parseV2Body(
  buffer: ArrayBuffer,
  view: DataView,
  magic: string
): HygCatalogData {
  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const spectStringTableBytes = view.getUint32(16, true);

  const expectedBytes =
    HYG_HEADER_BYTES_V2 + spectStringTableBytes + count * HYG_BYTES_PER_STAR_V2;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid HYG binary size: expected ${expectedBytes} bytes for ${count} stars + ${spectStringTableBytes}-byte spect table, got ${buffer.byteLength}`
    );
  }

  const spectStrings = readStringPool(
    view,
    HYG_HEADER_BYTES_V2,
    spectStringTableBytes,
    "spect"
  );

  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const pmRA = new Int16Array(count);
  const pmDec = new Int16Array(count);
  const spectIndices = new Uint8Array(count);
  const absmag = new Float32Array(count);

  let offset = HYG_HEADER_BYTES_V2 + spectStringTableBytes;
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
    offset += HYG_BYTES_PER_STAR_V2;
  }

  return {
    header: {
      magic,
      version: HYG_VERSION_V2,
      count,
      flags,
      hasProperMotion: (flags & HYG_FLAG_HAS_PROPER_MOTION) !== 0,
      hasSpectAndAbsmag: (flags & HYG_FLAG_HAS_SPECT_AND_ABSMAG) !== 0,
      hasDesignations: false,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
    spectStrings,
    spectIndices,
    absmag,
    ...emptyV3Fields(count),
  };
}

/**
 * v3 parser — M6-B layout. Reads five string tables after the header
 * (spect / properName / bayer / constellation / gliese) then the
 * per-star body with v2 fields plus designation indices and numeric
 * IDs (Flamsteed / HD / HIP).
 */
function parseV3Body(
  buffer: ArrayBuffer,
  view: DataView,
  magic: string
): HygCatalogData {
  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const spectStringTableBytes = view.getUint32(16, true);
  const properNameTableBytes = view.getUint32(20, true);
  const bayerTableBytes = view.getUint32(24, true);
  const constellationTableBytes = view.getUint32(28, true);
  const glieseTableBytes = view.getUint32(32, true);

  const totalTableBytes =
    spectStringTableBytes +
    properNameTableBytes +
    bayerTableBytes +
    constellationTableBytes +
    glieseTableBytes;

  const expectedBytes =
    HYG_HEADER_BYTES + totalTableBytes + count * HYG_BYTES_PER_STAR;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid HYG binary size: expected ${expectedBytes} bytes for ${count} stars + ${totalTableBytes}-byte string tables, got ${buffer.byteLength}`
    );
  }

  let cursor = HYG_HEADER_BYTES;
  const spectStrings = readStringPool(
    view,
    cursor,
    spectStringTableBytes,
    "spect"
  );
  cursor += spectStringTableBytes;
  const properNameStrings = readStringPool(
    view,
    cursor,
    properNameTableBytes,
    "properName"
  );
  cursor += properNameTableBytes;
  const bayerStrings = readStringPool(view, cursor, bayerTableBytes, "bayer");
  cursor += bayerTableBytes;
  const constellationStrings = readStringPool(
    view,
    cursor,
    constellationTableBytes,
    "constellation"
  );
  cursor += constellationTableBytes;
  const glieseStrings = readStringPool(
    view,
    cursor,
    glieseTableBytes,
    "gliese"
  );
  cursor += glieseTableBytes;

  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const pmRA = new Int16Array(count);
  const pmDec = new Int16Array(count);
  const spectIndices = new Uint8Array(count);
  const absmag = new Float32Array(count);
  const properNameIndices = new Uint16Array(count);
  const bayerIndices = new Uint8Array(count);
  const constellationIndices = new Uint8Array(count);
  const glieseIndices = new Uint16Array(count);
  const flamsteed = new Uint8Array(count);
  const hd = new Uint32Array(count);
  const hip = new Uint32Array(count);

  let offset = cursor;
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
    properNameIndices[i] = view.getUint16(offset + 23, true);
    bayerIndices[i] = view.getUint8(offset + 25);
    constellationIndices[i] = view.getUint8(offset + 26);
    glieseIndices[i] = view.getUint16(offset + 27, true);
    flamsteed[i] = view.getUint8(offset + 29);
    hd[i] = view.getUint32(offset + 30, true);
    hip[i] = view.getUint32(offset + 34, true);
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
      hasDesignations: (flags & HYG_FLAG_HAS_DESIGNATIONS) !== 0,
    },
    positions,
    magnitudes,
    colorIndices,
    pmRA,
    pmDec,
    spectStrings,
    spectIndices,
    absmag,
    properNameStrings,
    properNameIndices,
    bayerStrings,
    bayerIndices,
    constellationStrings,
    constellationIndices,
    glieseStrings,
    glieseIndices,
    flamsteed,
    hd,
    hip,
  };
}

/**
 * Encode a single star's v2 record bytes (positions, mag, ci, pmRA,
 * pmDec, spectIdx, absmag — 23 bytes total). The v3 encoder writes the
 * additional 15 bytes inline; this helper stays scoped to the v2 prefix
 * so the existing test for `encodeHygStar` continues to pin the
 * uint8-clamp + quantisation contract that the runtime relies on.
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

  // v2 fields. spectIdx clamped to uint8 range; out-of-range input
  // falls back to 0 (no classification) rather than wrapping.
  const spectIdxU8 = Math.max(0, Math.min(255, Math.round(spectIdx)));
  view.setUint8(offset + 18, spectIdxU8);
  view.setFloat32(offset + 19, absmag, true);
}

/** Encoder input shape — all designation fields are optional. */
export interface HygStarInput {
  x: number;
  y: number;
  z: number;
  mag: number;
  ci: number;
  pmRA: number;
  pmDec: number;
  spect?: string | null;
  absmag?: number | null;
  /** Proper name (e.g. "Sirius"). ASCII; "" / null / undefined → no name. */
  proper?: string | null;
  /** HYG Bayer abbreviation (e.g. "Alp", "Bet"). NOT Greek glyph. */
  bayer?: string | null;
  /** IAU 3-letter constellation (e.g. "CMa", "Ori"). */
  constellation?: string | null;
  /** Gliese designation (e.g. "Gl 244"). */
  gliese?: string | null;
  /** Flamsteed number; 0 / null / undefined → missing. uint8 cap. */
  flamsteed?: number | null;
  /** HD catalog ID; 0 / null / undefined → missing. uint32 cap. */
  hd?: number | null;
  /** HIP catalog ID; 0 / null / undefined → missing. uint32 cap. */
  hip?: number | null;
}

/**
 * Build a deduplicating string pool. Index 0 is always the "" sentinel.
 * Empty / null / undefined inputs collapse to index 0. Returns the
 * ordered string array (use as the resource for `writeStringPool`) and
 * a per-input index array.
 */
function buildStringPool(
  values: readonly (string | null | undefined)[],
  maxStrings: number,
  poolName: string
): { pool: string[]; indices: number[] } {
  const indexMap = new Map<string, number>();
  indexMap.set("", 0);
  const indices: number[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== "string" || v.length === 0) {
      indices[i] = 0;
      continue;
    }
    const existing = indexMap.get(v);
    if (existing !== undefined) {
      indices[i] = existing;
      continue;
    }
    if (indexMap.size >= maxStrings) {
      throw new Error(
        `HYG ${poolName} pool overflow: more than ${maxStrings - 1} unique entries`
      );
    }
    const idx = indexMap.size;
    indexMap.set(v, idx);
    indices[i] = idx;
  }
  const pool: string[] = new Array(indexMap.size);
  for (const [s, idx] of indexMap) pool[idx] = s;
  return { pool, indices };
}

/**
 * v3 catalog encoder. Emits magic="HYG1", version=3, and (when input
 * carries any designation) the `HYG_FLAG_HAS_DESIGNATIONS` bit. Builds
 * five string tables (spect / properName / bayer / constellation /
 * gliese) and writes per-star spect index + absmag + all v3 designation
 * indices and numeric IDs.
 */
export function encodeHygCatalog(stars: HygStarInput[]): ArrayBuffer {
  const count = stars.length;

  const spectInputs = stars.map((s) => s.spect ?? "");
  const properInputs = stars.map((s) => s.proper ?? "");
  const bayerInputs = stars.map((s) => s.bayer ?? "");
  const constellationInputs = stars.map((s) => s.constellation ?? "");
  const glieseInputs = stars.map((s) => s.gliese ?? "");

  const spect = buildStringPool(spectInputs, HYG_MAX_SPECT_STRINGS, "spect");
  const proper = buildStringPool(
    properInputs,
    HYG_MAX_PROPER_NAMES,
    "properName"
  );
  const bayer = buildStringPool(bayerInputs, HYG_MAX_BAYER_STRINGS, "bayer");
  const constellation = buildStringPool(
    constellationInputs,
    HYG_MAX_CONSTELLATION_STRINGS,
    "constellation"
  );
  const gliese = buildStringPool(
    glieseInputs,
    HYG_MAX_GLIESE_STRINGS,
    "gliese"
  );

  // Detect spect/absmag presence the same way v2 did so the flag
  // semantics stay consistent across versions.
  let hasSpectAndAbsmag = spect.pool.length > 1;
  if (!hasSpectAndAbsmag) {
    for (const star of stars) {
      if (Number.isFinite(star.absmag ?? NaN)) {
        hasSpectAndAbsmag = true;
        break;
      }
    }
  }

  // Designation flag: any non-empty pool beyond the "" sentinel OR any
  // numeric ID populated (flamsteed / hd / hip > 0).
  let hasDesignations =
    proper.pool.length > 1 ||
    bayer.pool.length > 1 ||
    constellation.pool.length > 1 ||
    gliese.pool.length > 1;
  if (!hasDesignations) {
    for (const star of stars) {
      const flam = star.flamsteed ?? 0;
      const hd = star.hd ?? 0;
      const hip = star.hip ?? 0;
      if (flam > 0 || hd > 0 || hip > 0) {
        hasDesignations = true;
        break;
      }
    }
  }

  const flags =
    HYG_FLAG_HAS_PROPER_MOTION |
    (hasSpectAndAbsmag ? HYG_FLAG_HAS_SPECT_AND_ABSMAG : 0) |
    (hasDesignations ? HYG_FLAG_HAS_DESIGNATIONS : 0);

  const spectBytes = stringPoolBytes(spect.pool);
  const properBytes = stringPoolBytes(proper.pool);
  const bayerBytes = stringPoolBytes(bayer.pool);
  const constellationBytes = stringPoolBytes(constellation.pool);
  const glieseBytes = stringPoolBytes(gliese.pool);
  const tableBytes =
    spectBytes + properBytes + bayerBytes + constellationBytes + glieseBytes;

  const totalBytes = HYG_HEADER_BYTES + tableBytes + count * HYG_BYTES_PER_STAR;
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
  view.setUint32(16, spectBytes, true);
  view.setUint32(20, properBytes, true);
  view.setUint32(24, bayerBytes, true);
  view.setUint32(28, constellationBytes, true);
  view.setUint32(32, glieseBytes, true);

  // String tables in declared order.
  let cursor = HYG_HEADER_BYTES;
  cursor = writeStringPool(view, cursor, spect.pool);
  cursor = writeStringPool(view, cursor, proper.pool);
  cursor = writeStringPool(view, cursor, bayer.pool);
  cursor = writeStringPool(view, cursor, constellation.pool);
  cursor = writeStringPool(view, cursor, gliese.pool);

  // Per-star body.
  let offset = cursor;
  for (let i = 0; i < count; i++) {
    const star = stars[i];
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
      spect.indices[i],
      absmagValue
    );
    // v3 extension fields (15 bytes after the v2 record).
    const properIdx = clampUint16(proper.indices[i]);
    const bayerIdxU8 = clampUint8(bayer.indices[i]);
    const constellationIdxU8 = clampUint8(constellation.indices[i]);
    const glieseIdxU16 = clampUint16(gliese.indices[i]);
    const flam = clampUint8(star.flamsteed ?? 0);
    const hdValue = clampUint32(star.hd ?? 0);
    const hipValue = clampUint32(star.hip ?? 0);
    view.setUint16(offset + 23, properIdx, true);
    view.setUint8(offset + 25, bayerIdxU8);
    view.setUint8(offset + 26, constellationIdxU8);
    view.setUint16(offset + 27, glieseIdxU16, true);
    view.setUint8(offset + 29, flam);
    view.setUint32(offset + 30, hdValue, true);
    view.setUint32(offset + 34, hipValue, true);
    offset += HYG_BYTES_PER_STAR;
  }

  return buffer;
}

function clampUint8(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clampUint16(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(65535, Math.round(n)));
}

function clampUint32(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(4294967295, Math.round(n));
}
