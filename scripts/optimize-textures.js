/**
 * WebP optimisation for the heaviest planetary textures.
 *
 * Produces sibling `.webp` files beside selected JPG/PNG sources under
 * `public/textures/`. The originals are kept in place as fallbacks —
 * this script never deletes or overwrites them. Runtime code prefers
 * the `.webp` when the browser supports it (see
 * `src/lib/textureVariants.ts` :: `preferWebPAsset`).
 *
 * Usage:
 *   node scripts/optimize-textures.js --all
 *   node scripts/optimize-textures.js public/textures/4k_oberon.png ...
 *
 * Sharp settings: quality 88 + effort 6. Conservative enough that the
 * 4k/8k maps remain visually indistinguishable at the orbital viewing
 * distances the runtime actually uses, while still trimming 60–85% off
 * disk / transfer size for the five largest files.
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// The five 10+ MB textures on disk. Paths are confirmed with
// `Get-ChildItem public/textures -Filter *.jpg,*.png | Sort Length`.
// Any additions here become part of the default `--all` batch.
const TARGET_FILES = [
  "public/textures/4k_oberon.png", // ~38 MB PNG
  "public/textures/4k_enceladus.jpg", // ~18 MB JPG
  "public/textures/8k_mercury.jpg", // ~15 MB JPG
  "public/textures/8k_moon.jpg", // ~15 MB JPG
  "public/textures/2k_tethys.jpg", // ~11 MB JPG
];

const QUALITY = 88;
const EFFORT = 6;

const log = (line) => process.stdout.write(`${line}\n`);

const formatMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

const formatDelta = (beforeBytes, afterBytes) => {
  const delta = afterBytes - beforeBytes;
  const pct = (delta / beforeBytes) * 100;
  const sign = delta <= 0 ? "" : "+";
  return `${sign}${pct.toFixed(1)}%`;
};

const isWebPFresh = (sourcePath, webpPath) => {
  if (!existsSync(webpPath)) return false;
  const sourceMtime = statSync(sourcePath).mtimeMs;
  const webpMtime = statSync(webpPath).mtimeMs;
  return webpMtime >= sourceMtime;
};

async function convertOne(relPath) {
  const sourcePath = path.resolve(REPO_ROOT, relPath);
  if (!existsSync(sourcePath)) {
    log(`skip: ${relPath} (not found)`);
    return { status: "missing" };
  }

  const parsed = path.parse(sourcePath);
  const webpPath = path.join(parsed.dir, `${parsed.name}.webp`);

  if (isWebPFresh(sourcePath, webpPath)) {
    const beforeBytes = statSync(sourcePath).size;
    const afterBytes = statSync(webpPath).size;
    log(
      `up-to-date: ${parsed.base} ${formatMB(beforeBytes)} -> ${parsed.name}.webp ${formatMB(afterBytes)} (${formatDelta(beforeBytes, afterBytes)})`
    );
    return { status: "cached", beforeBytes, afterBytes };
  }

  const beforeBytes = statSync(sourcePath).size;
  try {
    await sharp(sourcePath)
      .webp({ quality: QUALITY, effort: EFFORT })
      .toFile(webpPath);
  } catch (error) {
    // libwebp can fail on very large images with `wbuffer_write` errors.
    // Don't abort the whole batch — the runtime falls back to the original
    // when the `.webp` sibling is missing.
    log(
      `fail: ${parsed.base} -> ${parsed.name}.webp (${error instanceof Error ? error.message.split("\n")[0] : "unknown"})`
    );
    return { status: "failed" };
  }
  const afterBytes = statSync(webpPath).size;

  // Pessimization guard. Some source JPGs are already so aggressively
  // compressed that WebP cannot beat them at q=88. Keeping the larger
  // file would hurt load time — remove it so runtime falls back to the
  // original and we don't ship a dead artifact.
  if (afterBytes >= beforeBytes) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(webpPath);
    log(
      `discard: ${parsed.base} ${formatMB(beforeBytes)} -> ${parsed.name}.webp ${formatMB(afterBytes)} (${formatDelta(beforeBytes, afterBytes)}, not a win)`
    );
    return { status: "discarded" };
  }

  log(
    `${parsed.base} ${formatMB(beforeBytes)} -> ${parsed.name}.webp ${formatMB(afterBytes)} (${formatDelta(beforeBytes, afterBytes)})`
  );
  return { status: "converted", beforeBytes, afterBytes };
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = argv.includes("--all")
    ? TARGET_FILES
    : argv.filter((arg) => !arg.startsWith("--"));

  if (targets.length === 0) {
    log("Usage: node scripts/optimize-textures.js --all | <file1> <file2> ...");
    process.exit(1);
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let converted = 0;
  for (const target of targets) {
    const result = await convertOne(target);
    if (result.beforeBytes && result.afterBytes) {
      totalBefore += result.beforeBytes;
      totalAfter += result.afterBytes;
    }
    if (result.status === "converted") converted += 1;
  }

  if (totalBefore > 0) {
    log(
      `\nTotal: ${formatMB(totalBefore)} -> ${formatMB(totalAfter)} (${formatDelta(totalBefore, totalAfter)}), ${converted} re-encoded`
    );
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
