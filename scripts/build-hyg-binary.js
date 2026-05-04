/**
 * HYG v4.2 → runtime binary pipeline.
 *
 * Reads the cached CSV.gz produced by `scripts/download-hyg.js`, filters out
 * rows the renderer cannot use, sorts the catalog by apparent magnitude
 * (brightest first), and emits four tier files + a names sidecar under
 * `public/data/hyg-stars/`:
 *
 *   hyg-v1-low.bin.gz     — ~500    stars (brightest, constrained devices)
 *   hyg-v1-medium.bin.gz  — ~10 000 stars (balanced)
 *   hyg-v1-high.bin.gz    — ~50 000 stars (high)
 *   hyg-v1-full.bin.gz    — all stars that passed the filter (ultra)
 *   hyg-v1.names.json     — IAU / Bayer / Flamsteed labels for bright stars
 *
 * Tier files share per-star indexing: tier i is a strict prefix of tier i+1
 * in the sorted order, so a named entry pointing at index N in the Low tier
 * is also the same star at index N in Medium / High / Full.
 *
 * The binary layout is defined in `src/utils/hygBinary.ts`. This script
 * imports its `encodeHygCatalog` so there is one source of truth for the
 * format.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

// Re-use the canonical encoder from the runtime parser. The file is plain
// TypeScript; node 22 can load it natively when invoked with
// `--experimental-strip-types`. If that ever breaks we can translate the
// 60-line encoder inline here, but keeping one source beats drift.
import {
  encodeHygCatalog,
  HYG_HEADER_BYTES,
  HYG_BYTES_PER_STAR,
} from "../src/utils/hygBinary.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.join(__dirname, ".cache/hygdata_v42.csv.gz");
const OUTPUT_DIR = path.join(__dirname, "../public/data/hyg-stars");
const SIDECAR_PATH = path.join(OUTPUT_DIR, "hyg-v1.names.json");

/**
 * Tier targets. The "full" tier uses Infinity so every surviving star lands.
 * The other three are capped by star-count so the file size stays
 * predictable regardless of the upstream HYG distribution.
 */
const TIERS = [
  { name: "low", maxStars: 500 },
  { name: "medium", maxStars: 10_000 },
  { name: "high", maxStars: 50_000 },
  { name: "full", maxStars: Infinity },
];

const SENTINEL_DIST_PARSECS = 100_000; // HYG convention for "distance unknown"

function log(line) {
  process.stdout.write(`${line}\n`);
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function parseFloatOrNaN(str) {
  if (str == null || str === "") return NaN;
  const value = Number(str);
  return Number.isFinite(value) ? value : NaN;
}

/**
 * T6.2-β-β: canonicalize a HYG spectral classification string into a
 * stable, low-cardinality form that the runtime parser still reads
 * cleanly. Three-stage normalization:
 *
 *   1. Take the primary component (split on `+` / `/` for binary
 *      systems; take the first whitespace-separated token).
 *   2. Round fractional subclass to integer (M5.5V → M5V).
 *   3. Keep only the canonical letter + integer subclass + first
 *      luminosity-class match (Ia / Ib / V / III / etc.).
 *
 * Examples:
 *   "G2V"            → "G2V"
 *   "M1Ib + B2.5V"   → "M1Ib"  (binary primary)
 *   "M5.5V"          → "M6V"   (round fractional via Math.round; .5 rounds up)
 *   "G2:Va...e"      → "G2V"   (drop variant tail)
 *   "DA2"            → "DA2"   (white dwarf — full pattern)
 *   ""               → ""
 *
 * **Why round subclass**: Runtime `parseSpectralClass` accepts
 * fractional subclasses (M5.5 → linear-interp temperature ≈ 3030K)
 * but storing all fractional variants explodes the unique-strings
 * count past the 255 uint8 cap. Rounding to integer keeps temperature
 * within ~5% (Ballesteros's own error margin) and collapses the
 * unique-classes count from ~2800 to ~417 (atlas test, 2026-05-04).
 */
function canonicalizeSpect(spect) {
  if (!spect) return "";

  // 1. Primary component.
  const primary = spect
    .trim()
    .split(/\s*[+/]\s*/)[0]
    ?.split(/\s+/)[0]
    ?.trim();
  if (!primary) return "";

  // White-dwarf shortcuts. "WD" and "DA"-style patterns are kept as-is
  // (with fractional subclass rounded to integer if present).
  const wdMatch = primary.match(/^(D[A-Z]{0,2})(\d+(?:\.\d+)?)?$/i);
  if (wdMatch) {
    const prefix = wdMatch[1].toUpperCase();
    const sub = wdMatch[2] ? Math.round(Number(wdMatch[2])) : "";
    return `${prefix}${sub}`;
  }
  if (/^WD$/i.test(primary)) return "WD";

  // 2 + 3. Standard MK pattern: <letter><digit>?<luminosity>?.
  // Match longest luminosity prefix first (Ia, Ib, VII, VI, IV, III,
  // II, I, V, "0").
  const mkMatch = primary.match(
    /^([OBAFGKMLTY])(\d+(?:\.\d+)?)?(0|Ia|Ib|VII|VI|IV|III|II|I|V)?/i
  );
  if (!mkMatch) return ""; // unparseable → sentinel

  const letter = mkMatch[1].toUpperCase();
  const sub = mkMatch[2] !== undefined ? Math.round(Number(mkMatch[2])) : "";
  const lum = mkMatch[3] ? mkMatch[3] : "";
  return `${letter}${sub}${lum}`;
}

/**
 * T6.2-β-β: top-N cap by frequency. The HYG catalog has ~417 unique
 * canonical classes after `canonicalizeSpect` — over the uint8 cap of
 * 255. This pass counts class frequency, keeps the top-254 (reserving
 * the empty-string sentinel + 1 slot for safety), and rewrites
 * long-tail spect → "" so they fall back to B-V at runtime.
 *
 * Coverage at the 254 cap (catalog audit 2026-05-04): 96.01% of stars
 * keep their canonical class; 1.5% long-tail (~1,725 stars) get the
 * sentinel and use B-V fallback. The runtime parses the same way
 * either path — the difference is whether T_eff comes from the MK
 * lookup table or the Ballesteros formula (~5% error gap, sub-pixel
 * visual difference).
 */
function capSpectByFrequency(stars, maxClasses) {
  const counts = new Map();
  for (const star of stars) {
    if (!star.spect) continue;
    counts.set(star.spect, (counts.get(star.spect) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const keep = new Set(sorted.slice(0, maxClasses).map(([k]) => k));
  let dropped = 0;
  let droppedStars = 0;
  for (const star of stars) {
    if (star.spect && !keep.has(star.spect)) {
      star.spect = "";
      droppedStars += 1;
    }
  }
  dropped = counts.size - keep.size;
  return { uniqueClasses: counts.size, kept: keep.size, dropped, droppedStars };
}

/**
 * Stream-parse the HYG CSV.
 *
 * HYG CSV is standard comma-separated with a single header line. Fields we
 * need (`mag`, `ci`, `x`, `y`, `z`, `pmra`, `pmdec`, `dist`, `proper`,
 * `bayer`, `flam`, `con`, `hip`, `id`) never contain embedded commas, so a
 * simple split suffices — no quote handling needed.
 */
async function parseCsv(inputPath) {
  const input = fs.createReadStream(inputPath).pipe(zlib.createGunzip());
  const reader = createInterface({ input, crlfDelay: Infinity });

  const stars = [];
  let header = null;
  let headerIndex = null;
  let lineNumber = 0;

  for await (const line of reader) {
    lineNumber += 1;

    if (!header) {
      header = line.split(",").map((col) => col.replace(/^"|"$/g, "").trim());
      headerIndex = Object.fromEntries(header.map((name, i) => [name, i]));
      // T6.2-β-β: spect + absmag added to required columns. Both have
      // existed in HYG v4.2 since release; the build script just wasn't
      // reading them before this commit.
      const required = [
        "mag",
        "ci",
        "x",
        "y",
        "z",
        "pmra",
        "pmdec",
        "spect",
        "absmag",
      ];
      for (const name of required) {
        if (!(name in headerIndex)) {
          throw new Error(`HYG CSV is missing required column "${name}"`);
        }
      }
      continue;
    }

    if (!line) continue;
    const cells = line.split(",");

    // HYG convention: id = 0, proper = "Sol", position (~0, 0, 0) is the
    // Sun at the origin. The scene already renders the Sun as a dedicated
    // 3D body, so including it as a starfield point would cause an overlap
    // at the origin and a magnitude of -26.7 that the quantiser would clip.
    const idStr = cells[headerIndex.id]?.replace(/^"|"$/g, "").trim() ?? "";
    if (idStr === "0") continue;

    const mag = parseFloatOrNaN(cells[headerIndex.mag]);
    if (Number.isNaN(mag)) continue;

    const x = parseFloatOrNaN(cells[headerIndex.x]);
    const y = parseFloatOrNaN(cells[headerIndex.y]);
    const z = parseFloatOrNaN(cells[headerIndex.z]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) continue;

    const distParsecs = parseFloatOrNaN(cells[headerIndex.dist]);
    if (distParsecs >= SENTINEL_DIST_PARSECS) {
      // HYG uses dist>=100000 to mean "distance unknown" — the x/y/z it
      // ships for those rows are placeholders, not real positions. Drop.
      continue;
    }

    const ci = parseFloatOrNaN(cells[headerIndex.ci]);
    const pmRA = parseFloatOrNaN(cells[headerIndex.pmra]);
    const pmDec = parseFloatOrNaN(cells[headerIndex.pmdec]);

    // T6.2-β-β: extract spect + absmag for the v2 binary format.
    // `spect` is canonicalized to its primary component (binary-syntax
    // tails like "+B2.5V" stripped) so the build-time dedup matches
    // what the runtime parser would have extracted anyway. Empty
    // result → "" sentinel at index 0 of the encoder's string table.
    // `absmag` may be missing for distant / distance-unknown stars;
    // non-finite → NaN, encoder preserves NaN end-to-end.
    const spectRaw =
      cells[headerIndex.spect]?.replace(/^"|"$/g, "").trim() ?? "";
    const spect = canonicalizeSpect(spectRaw);
    const absmag = parseFloatOrNaN(cells[headerIndex.absmag]);

    const proper =
      cells[headerIndex.proper]?.replace(/^"|"$/g, "").trim() ?? "";
    const bayer = cells[headerIndex.bayer]?.replace(/^"|"$/g, "").trim() ?? "";
    const flam = cells[headerIndex.flam]?.replace(/^"|"$/g, "").trim() ?? "";
    const con = cells[headerIndex.con]?.replace(/^"|"$/g, "").trim() ?? "";
    const hip = cells[headerIndex.hip]?.replace(/^"|"$/g, "").trim() ?? "";

    stars.push({
      x,
      y,
      z,
      mag,
      ci: Number.isFinite(ci) ? ci : 0.65, // Sun-like default when unknown
      pmRA: Number.isFinite(pmRA) ? pmRA : 0,
      pmDec: Number.isFinite(pmDec) ? pmDec : 0,
      // T6.2-β-β v2 fields. Empty spect / NaN absmag are encoded as
      // sentinels by the binary encoder so they round-trip cleanly.
      spect,
      absmag: Number.isFinite(absmag) ? absmag : NaN,
      proper,
      bayer,
      flam,
      con,
      hip,
    });
  }

  log(`Parsed ${stars.length} usable stars (from ${lineNumber} lines).`);
  return stars;
}

function writeTier(tierName, stars) {
  const binaryBuffer = encodeHygCatalog(stars);
  const gzipBuffer = zlib.gzipSync(Buffer.from(binaryBuffer), { level: 9 });

  const binPath = path.join(OUTPUT_DIR, `hyg-v1-${tierName}.bin`);
  const gzPath = path.join(OUTPUT_DIR, `hyg-v1-${tierName}.bin.gz`);
  fs.writeFileSync(binPath, Buffer.from(binaryBuffer));
  fs.writeFileSync(gzPath, gzipBuffer);

  return {
    stars: stars.length,
    raw: binaryBuffer.byteLength,
    gzip: gzipBuffer.byteLength,
  };
}

function writeSidecar(stars) {
  const named = [];
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    // Only surface entries that carry at least one human-readable label.
    if (!s.proper && !s.bayer && !s.flam) continue;
    named.push({
      index: i,
      proper: s.proper || undefined,
      bayer: s.bayer || undefined,
      flam: s.flam || undefined,
      con: s.con || undefined,
      hip: s.hip ? Number(s.hip) : undefined,
      mag: Number(s.mag.toFixed(2)),
    });
  }

  // Sort by brightness so clients can cap the hover-search budget cheaply.
  named.sort((a, b) => a.mag - b.mag);

  const payload = {
    version: 1,
    source: "HYG v4.2 / AstroNexus (CC BY-SA 4.0)",
    entries: named,
  };
  fs.writeFileSync(SIDECAR_PATH, JSON.stringify(payload, null, 0));
  return named.length;
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(
      `Missing source file: ${INPUT_PATH}\nRun: npm run download:hyg`
    );
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  log("HYG v4.2 binary builder");
  log("-----------------------");
  log(`Input:  ${INPUT_PATH}`);
  log(`Output: ${OUTPUT_DIR}`);

  const stars = await parseCsv(INPUT_PATH);

  // T6.2-β-β: cap unique canonical spect classes to top-254 by
  // frequency (uint8 spectIdx → 256 slots, minus index 0 sentinel,
  // minus 1 safety = 254). HYG has ~417 unique classes after
  // canonicalization; the top-254 cover ~96% of stars. Long-tail
  // classes get spect="" → B-V fallback at runtime.
  const capStats = capSpectByFrequency(stars, 254);
  log(
    `Spect cap: ${capStats.kept} of ${capStats.uniqueClasses} canonical classes kept; ` +
      `${capStats.droppedStars} stars (${((100 * capStats.droppedStars) / stars.length).toFixed(2)}%) ` +
      `routed to B-V fallback.`
  );

  // Sort ascending by apparent magnitude so the brightest stars sit at the
  // start of every tier file.
  stars.sort((a, b) => a.mag - b.mag);

  log("");
  log("Tier files:");
  let previousCount = 0;
  for (const tier of TIERS) {
    const slice = stars.slice(
      0,
      tier.maxStars === Infinity ? stars.length : tier.maxStars
    );
    const stats = writeTier(tier.name, slice);
    const delta = stats.stars - previousCount;
    previousCount = stats.stars;
    const magMax = slice.length > 0 ? slice[slice.length - 1].mag : 0;
    log(
      `  ${tier.name.padEnd(7)} ${stats.stars
        .toString()
        .padStart(7)} stars  (+${delta.toString().padStart(6)})  ` +
        `mag ≤ ${magMax.toFixed(2).padStart(5)}  ` +
        `raw ${formatMB(stats.raw).padStart(8)}  gzip ${formatKB(stats.gzip).padStart(9)}`
    );
  }

  const namedCount = writeSidecar(stars);
  const sidecarBytes = fs.statSync(SIDECAR_PATH).size;
  log("");
  log(`Sidecar: ${namedCount} named entries, ${formatKB(sidecarBytes)}.`);

  log("");
  log(`Per-star record size: ${HYG_BYTES_PER_STAR} bytes`);
  log(`Header size:          ${HYG_HEADER_BYTES} bytes`);
}

main().catch((err) => {
  console.error(`Build failed: ${err.stack ?? err.message}`);
  process.exit(1);
});
