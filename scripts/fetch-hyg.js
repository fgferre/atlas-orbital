import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, "../src/data/tycho2-processed.json");
const HYG_URL =
  "https://raw.githubusercontent.com/astronexus/HYG-Database/master/hygdata_v3.csv";
const MAG_LIMIT = 8.5; // Adjust to control number of stars

console.log(`Fetching star data from ${HYG_URL}...`);

const options = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  },
};

https
  .get(HYG_URL, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Failed to fetch data: Status Code ${res.statusCode}`);
      if (res.statusCode === 429) {
        console.error(
          "Rate limited by GitHub. Please try again later or download the file manually."
        );
      }
      res.resume();
      return;
    }

    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
      process.stdout.write("."); // Progress indicator
    });

    res.on("end", () => {
      console.log("\nDownload complete. Processing data...");
      processCSV(data);
    });
  })
  .on("error", (e) => {
    console.error(`Got error: ${e.message}`);
  });

function processCSV(csvData) {
  const lines = csvData.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  // Find column indices
  const idIdx = headers.indexOf("id");
  const raIdx = headers.indexOf("ra");
  const decIdx = headers.indexOf("dec");
  const distIdx = headers.indexOf("dist");
  const magIdx = headers.indexOf("mag");
  const ciIdx = headers.indexOf("ci"); // Color Index

  if (raIdx === -1 || decIdx === -1 || magIdx === -1) {
    console.error("Critical columns missing in CSV");
    return;
  }

  const stars = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV parsing (simple split by comma, assuming no commas in fields for this dataset)
    const parts = line.split(",");

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
    // If dist is 100000 (infinity/unknown), parallax is small.
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
