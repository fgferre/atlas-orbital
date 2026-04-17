/**
 * Earth PBR texture bake.
 *
 * Downloads the Solar System Scope Earth normal + specular TIFFs (via the
 * Wayback Machine, because the canonical host blocks non-browser User-Agents
 * with a 403), caches them under `scripts/.cache/`, and emits four JPGs under
 * `public/textures/`:
 *
 *   - 2k_earth_normal_map.jpg
 *   - 8k_earth_normal_map.jpg
 *   - 2k_earth_roughness_map.jpg   (derived = 1 - specular)
 *   - 8k_earth_roughness_map.jpg   (derived = 1 - specular)
 *
 * The roughness map is inverted from SSS's specular because SSS paints oceans
 * bright (= reflective) and land dark (= matte), whereas `MeshStandardMaterial`
 * expects `roughnessMap` where 0 = mirror and 1 = fully matte.
 *
 * Source:     https://www.solarsystemscope.com/textures/
 * Licence:    Attribution 4.0 International (CC BY 4.0)
 * Snapshots:  captured via Wayback Machine — see WAYBACK_URLS below. The
 *             assets are frozen copies of SSS originals; no derivative
 *             modifications beyond format conversion + the documented
 *             specular -> roughness inversion.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(__dirname, "..", "public", "textures");

// Wayback Machine snapshots that return Content-Type: image/tiff for the
// SSS Earth PBR TIFFs. The direct SSS host blocks hotlinking (HTTP 403).
const WAYBACK_URLS = {
  "2k_earth_normal_map.tif":
    "https://web.archive.org/web/2024/https://www.solarsystemscope.com/textures/download/2k_earth_normal_map.tif",
  "8k_earth_normal_map.tif":
    "https://web.archive.org/web/2024/https://www.solarsystemscope.com/textures/download/8k_earth_normal_map.tif",
  "2k_earth_specular_map.tif":
    "https://web.archive.org/web/2025/https://www.solarsystemscope.com/textures/download/2k_earth_specular_map.tif",
  "8k_earth_specular_map.tif":
    "https://web.archive.org/web/2025/https://www.solarsystemscope.com/textures/download/8k_earth_specular_map.tif",
};

const MIN_TIFF_BYTES = 200_000;

const log = (line) => process.stdout.write(`${line}\n`);

async function ensureCachedTiff(filename) {
  const cachedPath = path.join(CACHE_DIR, filename);
  if (existsSync(cachedPath) && statSync(cachedPath).size >= MIN_TIFF_BYTES) {
    log(`[cache] ${filename} (${statSync(cachedPath).size} bytes)`);
    return cachedPath;
  }

  const url = WAYBACK_URLS[filename];
  if (!url) {
    throw new Error(`no Wayback URL registered for ${filename}`);
  }

  log(`[fetch] ${filename} <- ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `download failed for ${filename}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MIN_TIFF_BYTES) {
    throw new Error(
      `download returned too few bytes for ${filename}: ${buffer.length}`
    );
  }

  // TIFF little-endian magic: 49 49 2A 00
  const magic = buffer.subarray(0, 4).toString("hex");
  if (magic !== "49492a00" && magic !== "4d4d002a") {
    throw new Error(`download for ${filename} is not a TIFF (magic=${magic})`);
  }

  writeFileSync(cachedPath, buffer);
  log(`[wrote] ${cachedPath} (${buffer.length} bytes)`);
  return cachedPath;
}

async function bakeNormal(tiffPath, outName) {
  const outPath = path.join(OUT_DIR, outName);
  log(`[bake] ${outName}`);
  await sharp(readFileSync(tiffPath))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(outPath);
  const { size } = statSync(outPath);
  log(`       -> ${outPath} (${size} bytes)`);
}

async function bakeRoughness(tiffPath, outName) {
  // Specular map inversion: water (bright) becomes shiny (low roughness).
  // Land (dark) becomes matte (high roughness). Pipeline:
  //   1. Decode TIFF.
  //   2. Flatten to single grayscale channel (sharp does this from
  //      multi-channel TIFFs; SSS specular is already grayscale).
  //   3. `negate` to flip 0<->255 (the inversion).
  //   4. Re-encode as grayscale JPG to minimise bytes on disk.
  const outPath = path.join(OUT_DIR, outName);
  log(`[bake] ${outName}`);
  await sharp(readFileSync(tiffPath))
    .grayscale()
    .negate({ alpha: false })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(outPath);
  const { size } = statSync(outPath);
  log(`       -> ${outPath} (${size} bytes)`);
}

async function main() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const jobs = [
    {
      tif: "2k_earth_normal_map.tif",
      out: "2k_earth_normal_map.jpg",
      kind: "normal",
    },
    {
      tif: "8k_earth_normal_map.tif",
      out: "8k_earth_normal_map.jpg",
      kind: "normal",
    },
    {
      tif: "2k_earth_specular_map.tif",
      out: "2k_earth_roughness_map.jpg",
      kind: "roughness",
    },
    {
      tif: "8k_earth_specular_map.tif",
      out: "8k_earth_roughness_map.jpg",
      kind: "roughness",
    },
  ];

  for (const job of jobs) {
    const tiffPath = await ensureCachedTiff(job.tif);
    if (job.kind === "normal") {
      await bakeNormal(tiffPath, job.out);
    } else {
      await bakeRoughness(tiffPath, job.out);
    }
  }

  log("[done] Earth PBR bake complete.");
}

main().catch((err) => {
  console.error(`[error] ${err.message}`);
  process.exit(1);
});
