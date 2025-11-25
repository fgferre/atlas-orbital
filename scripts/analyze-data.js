import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, "hyg_v42.csv");

console.log(`Analyzing star data from ${INPUT_FILE}...`);

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Error: Input file not found at ${INPUT_FILE}`);
  process.exit(1);
}

const csvData = fs.readFileSync(INPUT_FILE, "utf8");
analyzeCSV(csvData);

function analyzeCSV(csvData) {
  const lines = csvData.split("\n");
  // Remove quotes from headers
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  const magIdx = headers.indexOf("mag");
  const distIdx = headers.indexOf("dist");

  if (magIdx === -1 || distIdx === -1) {
    console.error("Critical columns missing in CSV");
    console.log("Headers found:", headers);
    return;
  }

  let totalStars = 0;
  const magCounts = {
    "<6": 0,
    "<7": 0,
    "<8": 0,
    "<9": 0,
    "<10": 0,
    total: 0,
  };

  let minDist = Infinity;
  let maxDist = -Infinity;
  let distCount = 0;
  let zeroDist = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));

    const mag = parseFloat(parts[magIdx]);
    const dist = parseFloat(parts[distIdx]);

    if (isNaN(mag)) continue;

    totalStars++;

    if (mag < 6) magCounts["<6"]++;
    if (mag < 7) magCounts["<7"]++;
    if (mag < 8) magCounts["<8"]++;
    if (mag < 9) magCounts["<9"]++;
    if (mag < 10) magCounts["<10"]++;
    magCounts["total"]++;

    if (!isNaN(dist)) {
      distCount++;
      if (dist > 0) {
        if (dist < minDist) minDist = dist;
        if (dist > maxDist) maxDist = dist;
      } else {
        zeroDist++;
      }
    }
  }

  console.log("--- Analysis Results ---");
  console.log(`Total lines processed: ${lines.length}`);
  console.log(`Total valid stars found: ${totalStars}`);
  console.log("\nMagnitude Distribution:");
  console.log(`  Mag < 6:  ${magCounts["<6"]}`);
  console.log(`  Mag < 7:  ${magCounts["<7"]}`);
  console.log(`  Mag < 8:  ${magCounts["<8"]}`);
  console.log(`  Mag < 9:  ${magCounts["<9"]}`);
  console.log(`  Mag < 10: ${magCounts["<10"]}`);

  console.log("\nDistance Distribution (Parsecs):");
  console.log(`  Stars with valid distance: ${distCount}`);
  console.log(`  Stars with zero/invalid distance: ${zeroDist}`);
  console.log(`  Min Distance: ${minDist}`);
  console.log(`  Max Distance: ${maxDist}`);
}
