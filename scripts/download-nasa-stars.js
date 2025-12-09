import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://eyes.nasa.gov/assets/static/stars";
const OUTPUT_DIR = path.join(__dirname, "../public/data/nasa-stars");

// NASA Eyes star catalog binary files
// galaxies.0.bin: Extragalactic objects (galaxies)
// stars.N.bin: Stars binned by magnitude ranges
const FILES = [
  "galaxies.0.bin",
  "stars.0.bin", // Brightest stars (mag < 2)
  "stars.1.bin", // mag 2-4
  "stars.2.bin", // mag 4-6
  "stars.3.bin", // mag 6-8
  "stars.4.bin", // mag 8-10
  "stars.5.bin", // mag 10-12+
];

/**
 * Download a single file from NASA Eyes CDN
 * @param {string} filename - Name of the file to download
 * @returns {Promise<{filename: string, size: number, skipped: boolean, success: boolean, error?: string}>}
 */
async function downloadFile(filename) {
  const url = `${BASE_URL}/${filename}`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  // Skip if file already exists
  if (fs.existsSync(outputPath)) {
    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`⏭️  ${filename} already exists (${sizeMB} MB) - skipping`);
    return { filename, size: stats.size, skipped: true, success: true };
  }

  return new Promise((resolve) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          console.error(`✗ ${filename}: HTTP ${response.statusCode}`);
          resolve({
            filename,
            size: 0,
            skipped: false,
            success: false,
            error: `HTTP ${response.statusCode}`,
          });
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));

        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(outputPath, buffer);

          const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
          console.log(`✓ ${filename} (${sizeMB} MB)`);
          resolve({
            filename,
            size: buffer.length,
            skipped: false,
            success: true,
          });
        });

        response.on("error", (err) => {
          console.error(`✗ ${filename}: ${err.message}`);
          resolve({
            filename,
            size: 0,
            skipped: false,
            success: false,
            error: err.message,
          });
        });
      })
      .on("error", (err) => {
        console.error(`✗ ${filename}: ${err.message}`);
        resolve({
          filename,
          size: 0,
          skipped: false,
          success: false,
          error: err.message,
        });
      });
  });
}

async function downloadAll() {
  console.log("🚀 NASA Eyes Star Data Downloader");
  console.log("━".repeat(40));
  console.log(`Source: ${BASE_URL}`);
  console.log(`Target: ${OUTPUT_DIR}`);
  console.log("━".repeat(40));
  console.log("");

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
    console.log("");
  }

  // Download files sequentially (matches project pattern, avoids rate limiting)
  const results = [];
  for (const file of FILES) {
    const result = await downloadFile(file);
    results.push(result);
  }

  // Summary
  console.log("");
  console.log("━".repeat(40));

  const successful = results.filter((r) => r.success);
  const downloaded = results.filter((r) => r.success && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !r.success);

  const totalSize = successful.reduce((sum, r) => sum + r.size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

  console.log(`✓ ${successful.length}/${FILES.length} files ready`);
  if (downloaded.length > 0) {
    console.log(`  └─ Downloaded: ${downloaded.length}`);
  }
  if (skipped.length > 0) {
    console.log(`  └─ Skipped (already exist): ${skipped.length}`);
  }
  if (failed.length > 0) {
    console.log(`  └─ Failed: ${failed.length}`);
    failed.forEach((f) => console.log(`     • ${f.filename}: ${f.error}`));
  }

  console.log(`📊 Total size: ${totalSizeMB} MB`);
  console.log("");

  // Git LFS advisory
  if (totalSize > 50 * 1024 * 1024) {
    console.log("⚠️  Files exceed 50MB - Git LFS recommended");
    console.log(
      "   Run: git lfs install && git lfs track 'public/data/nasa-stars/*.bin'"
    );
    console.log("");
  }

  // Next steps
  console.log("💡 Next steps:");
  console.log("   1) Review files in public/data/nasa-stars/");
  console.log("   2) Commit to repository (or Git LFS if large)");
  console.log(
    "   3) Use in NASAStarfield component via fetch('/data/nasa-stars/...')"
  );
}

// Run
try {
  await downloadAll();
} catch (err) {
  console.error("Fatal error:", err.message);
  process.exit(1);
}
