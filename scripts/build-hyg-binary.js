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
      const required = ["mag", "ci", "x", "y", "z", "pmra", "pmdec"];
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
