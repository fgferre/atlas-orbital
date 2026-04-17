/**
 * HYG v4.2 star catalog downloader.
 *
 * Fetches the official CSV.gz from astronexus.com and caches it under
 * `scripts/.cache/` (git-ignored). Re-running the script is a no-op when
 * the cached file is already present and has a plausible size.
 *
 * The downloaded file is the **source** for `scripts/build-hyg-binary.js`,
 * which produces the runtime binary shipped under `public/data/hyg-stars/`.
 *
 * Source:     https://www.astronexus.com/hyg
 * Licence:    CC BY-SA 4.0 (attribution required in the app credits)
 * Expected size: ~13.6 MB (2026-04 release of v4.2)
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_URL =
  "https://astronexus.com/downloads/catalogs/hygdata_v42.csv.gz";
const CACHE_DIR = path.join(__dirname, ".cache");
const OUTPUT_PATH = path.join(CACHE_DIR, "hygdata_v42.csv.gz");
const MIN_EXPECTED_BYTES = 10 * 1024 * 1024;
const MAX_EXPECTED_BYTES = 25 * 1024 * 1024;

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function log(line) {
  // Single-line log helper so the script's output is grep-friendly.
  process.stdout.write(`${line}\n`);
}

function follow(url, resolve, reject, redirectsLeft) {
  https
    .get(url, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects when fetching ${SOURCE_URL}`));
          return;
        }
        follow(response.headers.location, resolve, reject, redirectsLeft - 1);
        return;
      }

      if (status !== 200) {
        reject(new Error(`HTTP ${status} when fetching ${url}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
      response.on("error", reject);
    })
    .on("error", reject);
}

function fetchSource() {
  return new Promise((resolve, reject) => {
    follow(SOURCE_URL, resolve, reject, 5);
  });
}

async function main() {
  log("HYG v4.2 downloader");
  log("-------------------");
  log(`Source: ${SOURCE_URL}`);
  log(`Target: ${OUTPUT_PATH}`);

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  if (fs.existsSync(OUTPUT_PATH)) {
    const size = fs.statSync(OUTPUT_PATH).size;
    if (size >= MIN_EXPECTED_BYTES && size <= MAX_EXPECTED_BYTES) {
      log(`Cached copy present (${formatMB(size)}), skipping download.`);
      return;
    }
    log(`Cached copy looks suspicious (${formatMB(size)}), redownloading.`);
  }

  const buffer = await fetchSource();

  if (buffer.length < MIN_EXPECTED_BYTES) {
    throw new Error(
      `Downloaded file is suspiciously small (${formatMB(buffer.length)}). Aborting.`
    );
  }

  fs.writeFileSync(OUTPUT_PATH, buffer);
  log(`Downloaded ${formatMB(buffer.length)}.`);
  log("Next step: npm run build:hyg");
}

main().catch((err) => {
  console.error(`Download failed: ${err.message}`);
  process.exit(1);
});
