import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, "hyg_v42.csv");
const OUTPUT_FILE = path.join(__dirname, "../src/data/tycho2-processed.json");
const MAG_LIMIT = 12.0; // Target ~100k+ stars for maximum density

console.log(`Processing star data from ${INPUT_FILE}...`);

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Error: Input file not found at ${INPUT_FILE}`);
  console.error("Please ensure hyg_v42.csv is in the scripts directory.");
  process.exit(1);
}

const csvData = fs.readFileSync(INPUT_FILE, "utf8");
processCSV(csvData);

function processCSV(csvData) {
  const lines = csvData.split("\n");
  // Remove quotes from headers
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  // Find column indices
  const idIdx = headers.indexOf("id");
  const raIdx = headers.indexOf("ra");
  const decIdx = headers.indexOf("dec");
  const distIdx = headers.indexOf("dist");
  const magIdx = headers.indexOf("mag");
  const ciIdx = headers.indexOf("ci"); // Color Index

  if (raIdx === -1 || decIdx === -1 || magIdx === -1) {
    console.error("Critical columns missing in CSV");
    console.log("Headers found:", headers);
    return;
  }

  const stars = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma, but handle potential quotes around values if simple split is enough
    // For HYG, simple split usually works if we strip quotes after
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));

    // Parse values
    const mag = parseFloat(parts[magIdx]);

    // Filter by magnitude
    if (isNaN(mag) || mag > MAG_LIMIT) {
      skipped++;
      continue;
    }

    const ra = parseFloat(parts[raIdx]);
    const dec = parseFloat(parts[decIdx]);
    const dist = parseFloat(parts[distIdx]); // Parsecs
    let ci = parseFloat(parts[ciIdx]);

    if (isNaN(ra) || isNaN(dec)) continue;

    // Fill missing Color Index with a default (e.g., Sun-like 0.65)
    if (isNaN(ci)) ci = 0.65;

    // Calculate parallax from distance if needed by app
    // parallax (mas) = 1000 / dist (pc)
    let parallax = 0.1;
    if (!isNaN(dist) && dist > 0) {
      parallax = 1000 / dist;
    }

    stars.push({
      id: parts[idIdx],
      ra: Number(ra.toFixed(5)),
      dec: Number(dec.toFixed(5)),
      parallax: Number(parallax.toFixed(4)),
      mag: Number(mag.toFixed(3)),
      colorIndex: Number(ci.toFixed(3)),
    });
  }

  console.log(`\nProcessed ${lines.length} lines.`);
  console.log(`Kept ${stars.length} stars (Mag <= ${MAG_LIMIT}).`);
  console.log(`Skipped ${skipped} stars.`);

  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stars));
  console.log(`Saved to ${OUTPUT_FILE}`);
}
